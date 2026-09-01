import argparse
import fitz  # PyMuPDF
import docx
import requests
import os
import logging
import re
import time
from pathlib import Path
from typing import Optional, Tuple
import sys

# Configuration
OLLAMA_ENDPOINT = os.getenv("OLLAMA_ENDPOINT", "http://localhost:11434/api/generate")
SUPPORTED_EXTENSIONS = {".pdf", ".docx", ".txt"}
REQUEST_TIMEOUT = 30
MAX_RETRIES = 2

# Setup logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

class ResumeAnalyzerError(Exception):
    """Custom exception for resume analyzer errors"""
    pass

class FileExtractor:
    """Handles text extraction from different file formats"""
    
    @staticmethod
    def extract_text_from_pdf(file_path: Path) -> str:
        try:
            doc = fitz.open(file_path)
            text = "\n".join([page.get_text() for page in doc])
            doc.close()
            return text
        except Exception as e:
            raise ResumeAnalyzerError(f"Failed to extract text from PDF: {e}")

    @staticmethod
    def extract_text_from_docx(file_path: Path) -> str:
        try:
            doc = docx.Document(file_path)
            return "\n".join([para.text for para in doc.paragraphs])
        except Exception as e:
            raise ResumeAnalyzerError(f"Failed to extract text from DOCX: {e}")

    @staticmethod
    def extract_text_from_txt(file_path: Path) -> str:
        try:
            with open(file_path, "r", encoding="utf-8") as f:
                return f.read()
        except UnicodeDecodeError:
            # Fallback to different encoding
            try:
                with open(file_path, "r", encoding="latin-1") as f:
                    return f.read()
            except Exception as e:
                raise ResumeAnalyzerError(f"Failed to read text file: {e}")
        except Exception as e:
            raise ResumeAnalyzerError(f"Failed to extract text from TXT: {e}")

    def extract_text(self, file_path: Path) -> str:
        """Extract text based on file extension"""
        extension = file_path.suffix.lower()
        
        extractors = {
            ".pdf": self.extract_text_from_pdf,
            ".docx": self.extract_text_from_docx,
            ".txt": self.extract_text_from_txt
        }
        
        if extension not in extractors:
            raise ResumeAnalyzerError(f"Unsupported file format: {extension}")
        
        return extractors[extension](file_path)

class ResumeValidator:
    """Validates if a document is likely a resume"""
    
    # Common resume section headers
    RESUME_SECTIONS = [
        r"experience", r"employment", r"work history", r"professional experience",
        r"education", r"academic background", r"qualification",
        r"skills", r"technical skills", r"competencies", r"expertise",
        r"projects", r"achievements", r"accomplishments",
        r"certifications", r"professional development", 
        r"summary", r"profile", r"objective", r"career objective"
    ]
    
    # Common job titles
    JOB_TITLES = [
        r"engineer", r"developer", r"manager", r"analyst", r"specialist",
        r"director", r"administrator", r"coordinator", r"lead", r"architect",
        r"consultant", r"designer", r"technician", r"scientist", r"officer"
    ]
    
    # Date patterns (mm/yyyy, yyyy-mm, etc.)
    DATE_PATTERNS = [
        r"\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]* \d{4}\b",
        r"\b\d{2}/\d{4}\b", r"\b\d{4}-\d{2}\b", r"\b\d{4}\s*-\s*present\b",
        r"\b\d{4}\s*-\s*\d{4}\b", r"\b\d{4}\s*to\s*\d{4}\b", r"\b\d{4}\s*to\s*present\b"
    ]
    
    # Technical terms
    TECH_TERMS = [
        r"python", r"java", r"javascript", r"c\+\+", r"html", r"css", r"sql",
        r"react", r"node", r"azure", r"aws", r"cloud", r"docker", r"kubernetes",
        r"agile", r"scrum", r"jira", r"git", r"linux", r"windows", r"database"
    ]
    
    @classmethod
    def is_resume(cls, text: str) -> Tuple[bool, float, str]:
        """
        Check if the document is likely a resume
        Returns: (is_resume, confidence_score, explanation)
        """
        if not text or len(text.strip()) < 200:
            return False, 0, "Document is too short to be a resume"
        
        text_lower = text.lower()
        
        # Score calculation based on patterns found
        score = 0
        explanation = []
        
        # Check for resume sections
        section_matches = 0
        for pattern in cls.RESUME_SECTIONS:
            if re.search(rf"\b{pattern}\b", text_lower):
                section_matches += 1
        
        if section_matches >= 3:
            score += 40
            explanation.append(f"Found {section_matches} resume sections")
        elif section_matches >= 1:
            score += 20
            explanation.append(f"Found {section_matches} resume sections")
        
        # Check for job titles
        job_matches = 0
        for pattern in cls.JOB_TITLES:
            if re.search(rf"\b{pattern}\b", text_lower):
                job_matches += 1
        
        if job_matches >= 2:
            score += 20
            explanation.append(f"Found {job_matches} job titles")
        elif job_matches >= 1:
            score += 10
            explanation.append(f"Found {job_matches} job titles")
        
        # Check for date patterns (work history)
        date_matches = 0
        for pattern in cls.DATE_PATTERNS:
            date_matches += len(re.findall(pattern, text_lower))
        
        if date_matches >= 3:
            score += 20
            explanation.append(f"Found {date_matches} date patterns")
        elif date_matches >= 1:
            score += 10
            explanation.append(f"Found {date_matches} date patterns")
        
        # Check for technical terms
        tech_matches = 0
        for pattern in cls.TECH_TERMS:
            if re.search(rf"\b{pattern}\b", text_lower):
                tech_matches += 1
        
        if tech_matches >= 5:
            score += 20
            explanation.append(f"Found {tech_matches} technical terms")
        elif tech_matches >= 2:
            score += 10
            explanation.append(f"Found {tech_matches} technical terms")
        
        # Calculate confidence as percentage
        confidence = score / 100
        
        # Decision based on score
        is_resume = score >= 50
        
        explanation_text = ", ".join(explanation)
        return is_resume, confidence, explanation_text
    
def build_resume_prompt(text: str) -> str:
    """Build the standard resume analysis prompt. Importable by the API."""
    return (
        "You are an expert resume analyst. Extract and summarize the professional information from the resume below.\n"
        "Output clean Markdown: use ## for section headings, **bold** for company names and emphasis, "
        "and - for bullet points. Omit personal contact details. Only include the highest academic degree.\n\n"
        "Use exactly this structure — no other text before or after:\n\n"
        "## Profile\n"
        "2-3 sentences: years of experience, current role, and core area of expertise.\n\n"
        "## Skills\n"
        "Group into 2-4 categories on separate lines. Format each line: **Category Name:** skill1, skill2, skill3\n\n"
        "## Experience\n"
        "For each role (most recent first):\n"
        "**Company Name** — Job Title *(Start – End)*\n"
        "- Key achievement or responsibility with specific metrics or technologies\n\n"
        "## Projects\n"
        "1-3 notable projects. Format: **Project Name** — one sentence on technical complexity and impact.\n\n"
        "## Education\n"
        "Highest degree and institution only. Include technical certifications if present.\n\n"
        "Resume:\n" + text
    )


class OllamaClient:
    """Direct Ollama client — used by the CLI. The API uses llm_provider instead."""

    def __init__(self, endpoint: str = OLLAMA_ENDPOINT, timeout: int = REQUEST_TIMEOUT):
        self.endpoint = endpoint
        self.timeout = timeout

    def summarize_resume(self, text: str, model: str, retries: int = MAX_RETRIES) -> str:
        if not text.strip():
            raise ResumeAnalyzerError("Resume text is empty")

        prompt = build_resume_prompt(text)

        attempt = 0
        while attempt <= retries:
            try:
                response = requests.post(
                    self.endpoint,
                    json={"model": model, "prompt": prompt, "stream": False},
                    timeout=self.timeout,
                )
                response.raise_for_status()

                result = response.json()
                if "response" not in result:
                    raise ResumeAnalyzerError("Invalid response format from Ollama")
                return result["response"]

            except requests.exceptions.Timeout:
                attempt += 1
                if attempt <= retries:
                    wait_time = 2 ** attempt
                    logger.warning(f"Timeout. Retrying in {wait_time}s... ({attempt}/{retries})")
                    time.sleep(wait_time)
                else:
                    raise ResumeAnalyzerError(
                        f"Timed out after {retries + 1} attempts. Try --timeout to increase."
                    )
            except requests.exceptions.ConnectionError:
                raise ResumeAnalyzerError("Cannot connect to Ollama. Is it running?")
            except requests.exceptions.RequestException as e:
                raise ResumeAnalyzerError(f"API request failed: {e}")
            except Exception as e:
                raise ResumeAnalyzerError(f"Unexpected error: {e}")

class ResumeAnalyzer:
    """Main application class"""
    
    def __init__(self, timeout: int = REQUEST_TIMEOUT):
        self.extractor = FileExtractor()
        self.validator = ResumeValidator()
        self.ollama_client = OllamaClient(timeout=timeout)
    
    def validate_file(self, file_path: Path) -> None:
        """Validate file exists and has supported extension"""
        if not file_path.exists():
            raise ResumeAnalyzerError(f"File not found: {file_path}")
        
        if not file_path.is_file():
            raise ResumeAnalyzerError(f"Path is not a file: {file_path}")
        
        if file_path.suffix.lower() not in SUPPORTED_EXTENSIONS:
            supported = ", ".join(SUPPORTED_EXTENSIONS)
            raise ResumeAnalyzerError(f"Unsupported file format. Supported: {supported}")
        
        # Check file size (limit to 10MB)
        if file_path.stat().st_size > 10 * 1024 * 1024:
            raise ResumeAnalyzerError("File too large (max 10MB)")
    
    def analyze(self, file_path: str, model: str, verbose: bool = False) -> str:
        """Main analysis method"""
        file_path = Path(file_path).resolve()
        
        # Validate input
        self.validate_file(file_path)
        
        # Extract text
        # logger.info("Extracting text from resume file...")
        text = self.extractor.extract_text(file_path)
        
        if not text.strip():
            raise ResumeAnalyzerError("No text found in the document")
        
        # Validate if it's a resume
        # logger.info("Validating if document is a resume...")
        is_resume, confidence, explanation = self.validator.is_resume(text)
        
        if not is_resume:
            raise ResumeAnalyzerError(
                f"This document doesn't appear to be a resume (confidence: {confidence:.0%}). {explanation}"
            )
        if verbose:
            print(f"\n✅ Resume validation passed with {confidence:.0%} confidence. {explanation}")
            print("\n📄 Extracted Resume Text:\n")
            print("-" * 50)
            print(text)
            print("-" * 50)
            print("\n🔍 Summarizing...\n")
        
        # Generate summary
        # logger.info(f"Generating summary using model: {model}")
        print("⏳ Analyzing resume with Ollama (this may take a minute)...")
        summary = self.ollama_client.summarize_resume(text, model)
        
        return summary

def main():
    parser = argparse.ArgumentParser(
        description="Resume Analyzer - Quickly summarize resumes",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    
    parser.add_argument(
        "filepath", 
        help="Path to resume file (.pdf, .docx, or .txt)"
    )
    parser.add_argument(
        "--model", 
        default="llama3", 
        help="Choose LLM model (default: llama3)"
    )
    parser.add_argument(
        "--verbose", 
        action="store_true", 
        help="Print full extracted text and detailed processing information"
    )
    parser.add_argument(
        "--quiet",
        action="store_true",
        help="Suppress info messages"
    )
    parser.add_argument(
        "--timeout",
        type=int,
        default=REQUEST_TIMEOUT,
        help=f"Request timeout in seconds (default: {REQUEST_TIMEOUT})"
    )

    args = parser.parse_args()
    
    if args.quiet:
        logging.getLogger().setLevel(logging.WARNING)
    
    try:
        analyzer = ResumeAnalyzer(timeout=args.timeout)
        summary = analyzer.analyze(args.filepath, args.model, args.verbose)

        print("\n🧑‍💼 Candidate Summary:")
        print("=" * 50)
        print(summary)
        print("=" * 50)
        
    except ResumeAnalyzerError as e:
        print(f"❌ Error: {e}")
        sys.exit(1)
    except KeyboardInterrupt:
        print("\n⏹️  Analysis interrupted by user")
        sys.exit(1)
    except Exception as e:
        logger.error(f"Unexpected error: {e}")
        print(f"❌ Unexpected error occurred. Check logs for details.")
        sys.exit(1)
        
if __name__ == "__main__":
    main()
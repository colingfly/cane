"""
Cane Document Intelligence — Retrieval Eval
============================================
Tests search and Ask AI quality against known ground-truth answers
from the 3 DOE AI documents.

Usage:
    pip install requests
    python cane_eval.py --url https://cane-production.up.railway.app --email colingfly@gmail.com --password YOUR_PASSWORD

Optional:
    --workspace "DOE AI Docs"   (scope to a specific workspace)
"""

import argparse
import json
import requests
import sys
import time
from dataclasses import dataclass, field
from typing import Optional

# ─── Ground Truth Test Cases ─────────────────────────────────────

@dataclass
class TestCase:
    query: str
    expected_keywords: list[str]       # Must appear in top result or AI answer
    expected_doc_substr: str           # Substring of expected source document title
    expected_page: Optional[int] = None  # Expected page number (if known)
    category: str = "general"          # Category for reporting

TEST_CASES = [
    # --- Specific fact retrieval ---
    TestCase(
        query="What is the VoltAIc Initiative and how much funding did it receive?",
        expected_keywords=["voltaic", "13 million", "$13"],
        expected_doc_substr="New Actions",
        expected_page=3,
        category="fact_retrieval",
    ),
    TestCase(
        query="How much is DOE investing in PolicyAI?",
        expected_keywords=["policyai", "pacific northwest", "pnnl"],
        expected_doc_substr="New Actions",
        expected_page=3,
        category="fact_retrieval",
    ),
    TestCase(
        query="Which national laboratories have AI testbeds?",
        expected_keywords=["argonne", "oak ridge", "sandia", "lawrence livermore"],
        expected_doc_substr="Testbeds",
        expected_page=6,
        category="fact_retrieval",
    ),
    TestCase(
        query="What architectures are available at DOE AI testbeds?",
        expected_keywords=["cerebras", "groq", "sambanova", "nvidia"],
        expected_doc_substr="Testbeds",
        expected_page=6,
        category="fact_retrieval",
    ),
    TestCase(
        query="What is the EES2 initiative?",
        expected_keywords=["semiconductor", "energy efficiency", "65 companies"],
        expected_doc_substr="New Actions",
        expected_page=6,
        category="fact_retrieval",
    ),

    # --- Concept / synthesis ---
    TestCase(
        query="What AI foundation models has DOE developed?",
        expected_keywords=["foundation model"],
        expected_doc_substr="Innovation Ecosystem",
        category="synthesis",
    ),
    TestCase(
        query="How is DOE addressing data center energy consumption?",
        expected_keywords=["data center", "energy"],
        expected_doc_substr="New Actions",
        category="synthesis",
    ),
    TestCase(
        query="What is DOE doing about AI safety and red teaming?",
        expected_keywords=["red team", "safety"],
        expected_doc_substr="Testbeds",
        expected_page=4,
        category="synthesis",
    ),
    TestCase(
        query="How is DOE using AI for clean energy permitting?",
        expected_keywords=["permitting", "siting"],
        expected_doc_substr="New Actions",
        category="synthesis",
    ),
    TestCase(
        query="What are Privacy Enhancing Technologies and how does DOE use them?",
        expected_keywords=["privacy", "pets"],
        expected_doc_substr="Testbeds",
        expected_page=5,
        category="synthesis",
    ),

    # --- Cross-document ---
    TestCase(
        query="What role do DOE national laboratories play in AI development?",
        expected_keywords=["national lab"],
        expected_doc_substr="",  # Could come from any doc
        category="cross_doc",
    ),
    TestCase(
        query="What is the COOLERCHIPS program?",
        expected_keywords=["coolerchips", "cooling", "arpa-e"],
        expected_doc_substr="New Actions",
        expected_page=6,
        category="fact_retrieval",
    ),

    # --- Edge cases ---
    TestCase(
        query="What did Secretary Granholm say about AI?",
        expected_keywords=["granholm"],
        expected_doc_substr="New Actions",
        expected_page=2,
        category="fact_retrieval",
    ),
    TestCase(
        query="SambaNova supercomputer",
        expected_keywords=["sambanova", "lawrence livermore"],
        expected_doc_substr="Testbeds",
        expected_page=4,
        category="fact_retrieval",
    ),
    TestCase(
        query="What is the A-Lab?",
        expected_keywords=["a-lab", "berkeley", "automated"],
        expected_doc_substr="Innovation Ecosystem",
        expected_page=5,
        category="fact_retrieval",
    ),
]


# ─── API Client ──────────────────────────────────────────────────

class CaneClient:
    def __init__(self, base_url: str, email: str, password: str):
        self.base_url = base_url.rstrip("/")
        self.session = requests.Session()
        self.token = self._login(email, password)
        self.session.headers.update({"Authorization": f"Bearer {self.token}"})

    def _login(self, email: str, password: str) -> str:
        resp = self.session.post(
            f"{self.base_url}/api/auth/login",
            data={"email": email, "password": password},
        )
        resp.raise_for_status()
        data = resp.json()
        token = data.get("token") or data.get("access_token")
        if not token:
            print(f"Login response: {json.dumps(data, indent=2)}")
            raise ValueError("Could not extract token from login response")
        print(f"[+] Logged in as {email}")
        return token

    def search(self, query: str, workspace: str = None) -> dict:
        params = {"q": query}
        if workspace:
            params["workspace_id"] = workspace
        resp = self.session.get(f"{self.base_url}/api/search", params=params)
        resp.raise_for_status()
        return resp.json()

    def ask_ai(self, query: str, workspace: str = None) -> dict:
        params = {"q": query}
        if workspace:
            params["workspace_id"] = workspace
        resp = self.session.get(f"{self.base_url}/api/ask", params=params)
        resp.raise_for_status()
        return resp.json()

    def list_documents(self) -> list:
        resp = self.session.get(f"{self.base_url}/api/documents")
        resp.raise_for_status()
        return resp.json()

    def list_workspaces(self) -> list:
        resp = self.session.get(f"{self.base_url}/api/workspaces")
        resp.raise_for_status()
        return resp.json()


# ─── Eval Logic ──────────────────────────────────────────────────

@dataclass
class TestResult:
    test: TestCase
    search_passed: bool = False
    search_rank: int = -1          # Rank of first relevant result (1-indexed)
    search_score: float = 0.0
    search_doc_match: bool = False
    search_page_match: bool = False
    search_keyword_hits: list = field(default_factory=list)
    search_keyword_misses: list = field(default_factory=list)
    search_top_result_text: str = ""
    ask_ai_passed: bool = False
    ask_ai_keyword_hits: list = field(default_factory=list)
    ask_ai_keyword_misses: list = field(default_factory=list)
    ask_ai_answer: str = ""
    ask_ai_error: str = ""
    search_error: str = ""


def evaluate_search(client: CaneClient, test: TestCase, workspace: str = None) -> dict:
    """Evaluate search results against ground truth."""
    result = TestResult(test=test)

    try:
        data = client.search(test.query, workspace)
        results = data if isinstance(data, list) else data.get("results", [])

        if not results:
            result.search_error = "No results returned"
            return result

        # Check each result for relevance
        for i, r in enumerate(results[:5]):  # Check top 5
            text = ""
            doc_name = ""
            page = None
            score = 0.0

            # Adapt to Cane's response shape
            if isinstance(r, dict):
                text = (r.get("text", "") or r.get("content", "") or "").lower()
                doc_name = (r.get("source_file", "") or r.get("document_name", "") or "").lower()
                page = r.get("page")
                score = r.get("score", 0) or r.get("rerank_score", 0)

            combined = f"{text} {doc_name}"

            # Check keywords
            hits = [kw for kw in test.expected_keywords if kw.lower() in combined]

            if hits and result.search_rank == -1:
                result.search_rank = i + 1
                result.search_score = score
                result.search_keyword_hits = hits
                result.search_doc_match = test.expected_doc_substr.lower() in doc_name if test.expected_doc_substr else True
                result.search_page_match = (page == test.expected_page) if test.expected_page else True
                result.search_top_result_text = text[:200]

        # Determine pass/fail
        result.search_keyword_misses = [
            kw for kw in test.expected_keywords
            if kw.lower() not in (result.search_top_result_text or "")
        ]
        result.search_passed = result.search_rank >= 1 and len(result.search_keyword_hits) >= 1

    except Exception as e:
        result.search_error = str(e)

    return result


def evaluate_ask_ai(client: CaneClient, test: TestCase, result: TestResult, workspace: str = None) -> TestResult:
    """Evaluate Ask AI response against ground truth."""
    try:
        data = client.ask_ai(test.query, workspace)

        # Handle Cane's response shape
        status = data.get("status", "") if isinstance(data, dict) else ""
        
        if status == "no_results":
            result.ask_ai_error = "No results found (retrieval returned nothing)"
            return result
        elif status == "no_llm":
            result.ask_ai_error = "No LLM configured"
            return result
        elif status == "error":
            result.ask_ai_error = data.get("error", "Unknown error")
            return result

        answer = data.get("summary", "") or data.get("answer", "") or data.get("response", "") or ""
        answer_lower = answer.lower()
        result.ask_ai_answer = answer[:500]

        if not answer:
            result.ask_ai_error = "Empty answer returned"
            return result

        result.ask_ai_keyword_hits = [
            kw for kw in test.expected_keywords if kw.lower() in answer_lower
        ]
        result.ask_ai_keyword_misses = [
            kw for kw in test.expected_keywords if kw.lower() not in answer_lower
        ]
        result.ask_ai_passed = len(result.ask_ai_keyword_hits) >= 1

    except Exception as e:
        result.ask_ai_error = str(e)

    return result


# ─── Reporting ───────────────────────────────────────────────────

def print_report(results: list[TestResult]):
    print("\n" + "=" * 70)
    print("  CANE RETRIEVAL EVAL REPORT")
    print("=" * 70)

    # Summary
    search_pass = sum(1 for r in results if r.search_passed)
    ask_pass = sum(1 for r in results if r.ask_ai_passed)
    total = len(results)

    print(f"\n  Search:  {search_pass}/{total} passed ({search_pass/total*100:.0f}%)")
    print(f"  Ask AI:  {ask_pass}/{total} passed ({ask_pass/total*100:.0f}%)")

    # By category
    categories = set(r.test.category for r in results)
    for cat in sorted(categories):
        cat_results = [r for r in results if r.test.category == cat]
        s_pass = sum(1 for r in cat_results if r.search_passed)
        a_pass = sum(1 for r in cat_results if r.ask_ai_passed)
        print(f"\n  [{cat}]")
        print(f"    Search: {s_pass}/{len(cat_results)}  |  Ask AI: {a_pass}/{len(cat_results)}")

    # Detail
    print("\n" + "-" * 70)
    print("  DETAILED RESULTS")
    print("-" * 70)

    for i, r in enumerate(results, 1):
        status_s = "PASS" if r.search_passed else "FAIL"
        status_a = "PASS" if r.ask_ai_passed else "FAIL"
        print(f"\n  [{i}] {r.test.query}")
        print(f"      Search: {status_s}", end="")
        if r.search_passed:
            print(f"  (rank #{r.search_rank}, score={r.search_score:.2f})")
        elif r.search_error:
            print(f"  — {r.search_error}")
        else:
            print(f"  — keywords found: {r.search_keyword_hits or 'none'}")

        print(f"      Ask AI: {status_a}", end="")
        if r.ask_ai_passed:
            print(f"  (keywords hit: {r.ask_ai_keyword_hits})")
        elif r.ask_ai_error:
            print(f"  — {r.ask_ai_error}")
        else:
            print(f"  — keywords found: {r.ask_ai_keyword_hits or 'none'}")

        if not r.search_passed and r.search_top_result_text:
            print(f"      Got: {r.search_top_result_text[:100]}...")
        if not r.ask_ai_passed and r.ask_ai_answer:
            print(f"      AI said: {r.ask_ai_answer[:150]}...")

    # Failures summary
    failures = [r for r in results if not r.search_passed or not r.ask_ai_passed]
    if failures:
        print("\n" + "-" * 70)
        print("  ISSUES TO INVESTIGATE")
        print("-" * 70)
        for r in failures:
            if not r.search_passed:
                print(f"\n  SEARCH FAIL: \"{r.test.query}\"")
                if r.search_error:
                    print(f"    Error: {r.search_error}")
                else:
                    print(f"    Expected keywords: {r.test.expected_keywords}")
                    print(f"    Expected doc: {r.test.expected_doc_substr}")
                    if r.search_top_result_text:
                        print(f"    Got instead: {r.search_top_result_text[:150]}")
            if not r.ask_ai_passed:
                print(f"\n  ASK AI FAIL: \"{r.test.query}\"")
                if r.ask_ai_error:
                    print(f"    Error: {r.ask_ai_error}")
                else:
                    print(f"    Expected keywords: {r.test.expected_keywords}")
                    print(f"    Keywords hit: {r.ask_ai_keyword_hits}")
                    print(f"    Keywords missed: {r.ask_ai_keyword_misses}")

    print("\n" + "=" * 70)
    return search_pass, ask_pass, total


# ─── Main ────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Cane Retrieval Eval")
    parser.add_argument("--url", required=True, help="Cane base URL")
    parser.add_argument("--email", required=True, help="Admin email")
    parser.add_argument("--password", required=True, help="Admin password")
    parser.add_argument("--workspace", default=None, help="Workspace name to scope queries")
    parser.add_argument("--skip-ask", action="store_true", help="Skip Ask AI tests")
    args = parser.parse_args()

    print(f"\n  Cane Eval — {args.url}")
    print(f"  {len(TEST_CASES)} test cases\n")

    # Connect
    client = CaneClient(args.url, args.email, args.password)

    # Show what's in the system
    try:
        docs = client.list_documents()
        doc_list = docs if isinstance(docs, list) else docs.get("documents", [])
        print(f"  Documents in system: {len(doc_list)}")
        for d in doc_list[:10]:
            name = d.get("name") or d.get("filename") or d.get("title") or str(d)
            print(f"    - {name}")
    except Exception as e:
        print(f"  Could not list documents: {e}")

    print()

    # Run tests
    results = []
    for i, test in enumerate(TEST_CASES, 1):
        print(f"  [{i}/{len(TEST_CASES)}] Testing: {test.query[:60]}...", flush=True)

        # Search eval
        result = evaluate_search(client, test, args.workspace)

        # Ask AI eval
        if not args.skip_ask:
            time.sleep(1.5)  # Rate limit courtesy — Ask AI calls Claude
            result = evaluate_ask_ai(client, test, result, args.workspace)

        results.append(result)
        time.sleep(0.3)

    # Report
    search_pass, ask_pass, total = print_report(results)

    # Exit code
    if search_pass < total * 0.7:
        sys.exit(1)


if __name__ == "__main__":
    main()
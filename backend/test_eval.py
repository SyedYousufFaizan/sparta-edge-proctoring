import os
import asyncio
from dotenv import load_dotenv

# Set dummy environment for testing if needed
load_dotenv()

from brain import groq_client, FAST_MODEL
import json

def evaluate_answer_fast(question: str, answer: str, ruthlessness: str) -> str:
    prompt = f"""
    Evaluate the candidate's answer to the interview question.
    
    RUTHLESSNESS MODIFIER: {ruthlessness}
    
    QUESTION: {question}
    ANSWER: {answer}
    
    Classify the answer into exactly one of these categories:
    - "STRONG": The answer is technically detailed, directly addresses the core concepts of the question, and demonstrates competence (even if concise). If the candidate makes a good faith technical effort, default to STRONG.
    - "WEAK": The answer is excessively vague, dodges the core technical question, or contains glaring technical errors.
    - "SURRENDER": The candidate explicitly admits they don't know, says "pass", or gives up.
    
    Return JSON exactly: {{"classification": "STRONG" | "WEAK" | "SURRENDER"}}
    """
    
    try:
        completion = groq_client.chat.completions.create(
            model=FAST_MODEL,
            messages=[{"role": "user", "content": prompt}],
            response_format={"type": "json_object"},
            temperature=0.1
        )
        result = json.loads(completion.choices[0].message.content)
        return result.get("classification", "STRONG")
    except Exception as e:
        print(f"Eval Error: {e}")
        return "STRONG" # Fallback to avoid infinite loops

if __name__ == "__main__":
    q1 = "Describe the core architectural design you chose for the digital card API and why it suited the system's scalability needs."
    a1_surrender = "I honestly don't know, someone else built it."
    a1_weak = "We used a database and some APIs to make it scalable."
    a1_strong = "We used an event-driven microservices architecture with Node.js and Redis caching to handle 10k RPS, ensuring decoupled webhook processing."
    
    ruthless = "Be relentlessly critical and expect FAANG-level precision."
    lenient = "Be gentle and forgiving."
    
    print("Test 1 (Surrender):", evaluate_answer_fast(q1, a1_surrender, ruthless))
    print("Test 2 (Weak - Ruthless):", evaluate_answer_fast(q1, a1_weak, ruthless))
    print("Test 3 (Weak - Lenient):", evaluate_answer_fast(q1, a1_weak, lenient))
    print("Test 4 (Strong - Ruthless):", evaluate_answer_fast(q1, a1_strong, ruthless))

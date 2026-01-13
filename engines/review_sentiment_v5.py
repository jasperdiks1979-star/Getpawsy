#!/usr/bin/env python3
"""
GetPawsy AI Review Sentiment Analyzer V5.4
Analyze customer reviews for sentiment and insights
"""

import os
import json
import requests
from pathlib import Path
from datetime import datetime
from typing import Dict, List, Optional
from collections import defaultdict

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "data"
REVIEWS_FILE = DATA_DIR / "reviews.json"
ANALYSIS_FILE = DATA_DIR / "review_analysis.json"

def get_openai_key():
    return os.environ.get("AI_INTEGRATIONS_OPENAI_API_KEY") or os.environ.get("OPENAI_API_KEY")

def load_reviews() -> List[Dict]:
    """Load all reviews"""
    if REVIEWS_FILE.exists():
        with open(REVIEWS_FILE, "r") as f:
            data = json.load(f)
            return data if isinstance(data, list) else data.get("reviews", [])
    return []

def load_analysis() -> Dict:
    """Load previous analysis"""
    if ANALYSIS_FILE.exists():
        with open(ANALYSIS_FILE, "r") as f:
            return json.load(f)
    return {"reviews": {}, "products": {}, "overall": {}}

def save_analysis(data: Dict):
    """Save analysis"""
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    with open(ANALYSIS_FILE, "w") as f:
        json.dump(data, f, indent=2)

def analyze_sentiment_simple(text: str, rating: int = None) -> Dict:
    """Simple rule-based sentiment analysis"""
    text_lower = text.lower()
    
    # Positive indicators
    positive_words = ["love", "great", "amazing", "excellent", "perfect", "best", 
                      "happy", "recommend", "quality", "fantastic", "wonderful",
                      "adorable", "cute", "obsessed", "favorite", "awesome"]
    
    # Negative indicators
    negative_words = ["bad", "terrible", "awful", "hate", "disappointed", "broken",
                      "cheap", "waste", "poor", "never", "worst", "horrible", "defective"]
    
    # Neutral indicators
    neutral_words = ["okay", "ok", "fine", "decent", "average", "alright"]
    
    pos_count = sum(1 for word in positive_words if word in text_lower)
    neg_count = sum(1 for word in negative_words if word in text_lower)
    neu_count = sum(1 for word in neutral_words if word in text_lower)
    
    # Use rating as additional signal
    if rating:
        if rating >= 4:
            pos_count += 2
        elif rating <= 2:
            neg_count += 2
    
    total = pos_count + neg_count + neu_count
    if total == 0:
        return {"sentiment": "neutral", "score": 0.5, "confidence": 0.3}
    
    if pos_count > neg_count and pos_count > neu_count:
        score = 0.5 + (pos_count / total) * 0.5
        return {"sentiment": "positive", "score": round(score, 2), "confidence": 0.6}
    elif neg_count > pos_count:
        score = 0.5 - (neg_count / total) * 0.5
        return {"sentiment": "negative", "score": round(score, 2), "confidence": 0.6}
    else:
        return {"sentiment": "neutral", "score": 0.5, "confidence": 0.5}

def analyze_sentiment_ai(text: str, rating: int = None) -> Dict:
    """AI-powered sentiment analysis"""
    api_key = get_openai_key()
    if not api_key:
        return analyze_sentiment_simple(text, rating)
    
    try:
        response = requests.post(
            "https://api.openai.com/v1/chat/completions",
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json"
            },
            json={
                "model": "gpt-4o-mini",
                "messages": [
                    {
                        "role": "system",
                        "content": """Analyze this product review sentiment. Return ONLY a JSON object with:
{
    "sentiment": "positive" | "negative" | "neutral" | "mixed",
    "score": 0.0-1.0 (0=very negative, 1=very positive),
    "confidence": 0.0-1.0,
    "emotions": ["list of detected emotions"],
    "topics": ["list of topics mentioned"],
    "key_phrases": ["important phrases from review"]
}"""
                    },
                    {
                        "role": "user",
                        "content": f"Review (Rating: {rating}/5):\n{text}"
                    }
                ],
                "max_tokens": 200,
                "temperature": 0.3
            },
            timeout=10
        )
        
        if response.status_code == 200:
            content = response.json()["choices"][0]["message"]["content"]
            # Parse JSON from response
            try:
                # Clean up potential markdown code blocks
                content = content.strip()
                if content.startswith("```"):
                    content = content.split("```")[1]
                    if content.startswith("json"):
                        content = content[4:]
                return json.loads(content)
            except:
                pass
    except:
        pass
    
    return analyze_sentiment_simple(text, rating)

def analyze_review(review: Dict) -> Dict:
    """Analyze a single review"""
    text = review.get("text", review.get("content", ""))
    rating = review.get("rating", review.get("stars", 0))
    
    if not text:
        return {
            "sentiment": "neutral",
            "score": rating / 5 if rating else 0.5,
            "confidence": 0.3,
            "analyzed_at": datetime.now().isoformat()
        }
    
    analysis = analyze_sentiment_ai(text, rating)
    analysis["analyzed_at"] = datetime.now().isoformat()
    analysis["review_id"] = review.get("id")
    analysis["product_id"] = review.get("product_id")
    
    return analysis

def analyze_all_reviews() -> Dict:
    """Analyze all reviews"""
    reviews = load_reviews()
    analysis_data = load_analysis()
    
    results = {
        "total_analyzed": 0,
        "sentiment_distribution": defaultdict(int),
        "avg_score": 0,
        "by_product": defaultdict(list)
    }
    
    scores = []
    
    for review in reviews:
        review_id = str(review.get("id", ""))
        
        # Skip if already analyzed
        if review_id in analysis_data.get("reviews", {}):
            existing = analysis_data["reviews"][review_id]
            results["sentiment_distribution"][existing.get("sentiment", "neutral")] += 1
            scores.append(existing.get("score", 0.5))
            continue
        
        # Analyze
        analysis = analyze_review(review)
        
        # Store
        if "reviews" not in analysis_data:
            analysis_data["reviews"] = {}
        analysis_data["reviews"][review_id] = analysis
        
        results["total_analyzed"] += 1
        results["sentiment_distribution"][analysis.get("sentiment", "neutral")] += 1
        scores.append(analysis.get("score", 0.5))
        
        # Group by product
        product_id = str(review.get("product_id", ""))
        if product_id:
            results["by_product"][product_id].append(analysis)
    
    if scores:
        results["avg_score"] = round(sum(scores) / len(scores), 2)
    
    # Save analysis
    analysis_data["last_run"] = datetime.now().isoformat()
    analysis_data["overall"] = {
        "total_reviews": len(reviews),
        "avg_sentiment_score": results["avg_score"],
        "sentiment_distribution": dict(results["sentiment_distribution"])
    }
    save_analysis(analysis_data)
    
    results["sentiment_distribution"] = dict(results["sentiment_distribution"])
    results["by_product"] = dict(results["by_product"])
    return results

def get_product_sentiment(product_id: str) -> Dict:
    """Get sentiment analysis for a specific product"""
    analysis_data = load_analysis()
    reviews = load_reviews()
    
    product_reviews = [r for r in reviews if str(r.get("product_id")) == str(product_id)]
    
    if not product_reviews:
        return {"error": "No reviews found for this product"}
    
    sentiments = []
    scores = []
    
    for review in product_reviews:
        review_id = str(review.get("id", ""))
        if review_id in analysis_data.get("reviews", {}):
            analysis = analysis_data["reviews"][review_id]
            sentiments.append(analysis.get("sentiment", "neutral"))
            scores.append(analysis.get("score", 0.5))
        else:
            # Analyze on the fly
            analysis = analyze_review(review)
            sentiments.append(analysis.get("sentiment", "neutral"))
            scores.append(analysis.get("score", 0.5))
    
    sentiment_counts = defaultdict(int)
    for s in sentiments:
        sentiment_counts[s] += 1
    
    return {
        "product_id": product_id,
        "total_reviews": len(product_reviews),
        "avg_score": round(sum(scores) / len(scores), 2) if scores else 0,
        "sentiment_distribution": dict(sentiment_counts),
        "dominant_sentiment": max(sentiment_counts, key=sentiment_counts.get) if sentiment_counts else "neutral"
    }

def get_negative_reviews(limit: int = 10) -> List[Dict]:
    """Get reviews that need attention (negative sentiment)"""
    reviews = load_reviews()
    analysis_data = load_analysis()
    
    negative = []
    
    for review in reviews:
        review_id = str(review.get("id", ""))
        analysis = analysis_data.get("reviews", {}).get(review_id, {})
        
        if analysis.get("sentiment") == "negative" or analysis.get("score", 1) < 0.4:
            negative.append({
                "review": review,
                "analysis": analysis
            })
    
    # Sort by score (lowest first)
    negative.sort(key=lambda x: x.get("analysis", {}).get("score", 0.5))
    
    return negative[:limit]

def generate_review_summary(product_id: str = None) -> str:
    """Generate AI summary of reviews"""
    api_key = get_openai_key()
    reviews = load_reviews()
    
    if product_id:
        reviews = [r for r in reviews if str(r.get("product_id")) == str(product_id)]
    
    if not reviews:
        return "No reviews available for summary."
    
    # Limit to recent reviews
    reviews = reviews[-20:]
    
    review_texts = []
    for r in reviews:
        text = r.get("text", r.get("content", ""))
        rating = r.get("rating", r.get("stars", 0))
        if text:
            review_texts.append(f"[{rating}/5] {text[:200]}")
    
    if not api_key or not review_texts:
        # Simple summary
        avg_rating = sum(r.get("rating", r.get("stars", 0)) for r in reviews) / len(reviews)
        return f"Based on {len(reviews)} reviews with an average rating of {avg_rating:.1f}/5 stars."
    
    try:
        response = requests.post(
            "https://api.openai.com/v1/chat/completions",
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json"
            },
            json={
                "model": "gpt-4o-mini",
                "messages": [
                    {
                        "role": "system",
                        "content": "Summarize these product reviews in 2-3 sentences. Highlight what customers love and any common complaints. Be concise."
                    },
                    {
                        "role": "user",
                        "content": "Reviews:\n" + "\n".join(review_texts)
                    }
                ],
                "max_tokens": 150,
                "temperature": 0.5
            },
            timeout=15
        )
        
        if response.status_code == 200:
            return response.json()["choices"][0]["message"]["content"]
    except:
        pass
    
    return f"Summary unavailable. Based on {len(reviews)} reviews."

def get_sentiment_stats() -> Dict:
    """Get overall sentiment statistics"""
    analysis_data = load_analysis()
    
    return {
        "overall": analysis_data.get("overall", {}),
        "last_run": analysis_data.get("last_run"),
        "total_analyzed": len(analysis_data.get("reviews", {}))
    }

def get_sentiment_trends(days: int = 30) -> List[Dict]:
    """Get sentiment trends over time"""
    reviews = load_reviews()
    analysis_data = load_analysis()
    
    # Group by date
    by_date = defaultdict(lambda: {"count": 0, "total_score": 0})
    
    for review in reviews:
        review_id = str(review.get("id", ""))
        analysis = analysis_data.get("reviews", {}).get(review_id, {})
        
        date_str = review.get("created_at", review.get("date", ""))
        if not date_str:
            continue
        
        try:
            date = datetime.fromisoformat(date_str.replace("Z", "+00:00")).date()
            by_date[str(date)]["count"] += 1
            by_date[str(date)]["total_score"] += analysis.get("score", 0.5)
        except:
            continue
    
    # Calculate averages
    trends = []
    for date, data in sorted(by_date.items())[-days:]:
        avg_score = data["total_score"] / data["count"] if data["count"] > 0 else 0.5
        trends.append({
            "date": date,
            "review_count": data["count"],
            "avg_sentiment_score": round(avg_score, 2)
        })
    
    return trends

if __name__ == "__main__":
    print("=== AI Review Sentiment Analyzer V5.4 ===")
    
    print("\nAnalyzing all reviews...")
    results = analyze_all_reviews()
    print(f"Analyzed {results['total_analyzed']} new reviews")
    print(f"Average sentiment score: {results['avg_score']}")
    print(f"Distribution: {results['sentiment_distribution']}")
    
    print("\nStats:")
    print(json.dumps(get_sentiment_stats(), indent=2))
    
    print("\nNegative reviews needing attention:")
    for item in get_negative_reviews(5):
        print(f"  - Score: {item['analysis'].get('score', 'N/A')} - {item['review'].get('text', '')[:50]}...")

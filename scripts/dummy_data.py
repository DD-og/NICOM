"""Dummy data for NICOM 2026 review portal.

Run: python3 scripts/dummy_data.py  -> writes data/dummy_source.json
Everything here is fictional; emails use the reserved example.* domains.
"""
import json, random
from datetime import datetime, timedelta
from pathlib import Path

random.seed(2026)

DOMAINS = [
    "Finance & Accounting",
    "Marketing",
    "HR & Organizational Behaviour",
    "Operations & Supply Chain",
    "Business Analytics & AI",
    "Strategy & Entrepreneurship",
    "Economics & Public Policy",
    "Sustainability & ESG",
]

FACULTY = [
    ("Dr. Meera Iyer", ["Finance & Accounting", "Economics & Public Policy"]),
    ("Dr. Rohan Desai", ["Finance & Accounting"]),
    ("Dr. Kavita Nair", ["Marketing"]),
    ("Dr. Arjun Malhotra", ["Marketing", "Strategy & Entrepreneurship"]),
    ("Dr. Sneha Kulkarni", ["HR & Organizational Behaviour"]),
    ("Dr. Vikram Joshi", ["Operations & Supply Chain", "Sustainability & ESG"]),
    ("Dr. Ananya Rao", ["Business Analytics & AI"]),
    ("Dr. Siddharth Mehta", ["Business Analytics & AI", "Operations & Supply Chain"]),
    ("Dr. Pooja Trivedi", ["Strategy & Entrepreneurship", "HR & Organizational Behaviour"]),
    ("Dr. Nikhil Bhatt", ["Economics & Public Policy", "Sustainability & ESG"]),
]

PAPERS = [
    ("Finance & Accounting", "Impact of ESG Disclosure on Cost of Capital: Evidence from NIFTY 500 Firms", "ESG disclosure; cost of equity; emerging markets"),
    ("Finance & Accounting", "Retail Investor Herding in Indian Equity Markets during the Post-Pandemic F&O Boom", "behavioural finance; herding; derivatives"),
    ("Finance & Accounting", "UPI Adoption and Financial Inclusion among Small Merchants in Gujarat", "digital payments; UPI; financial inclusion"),
    ("Marketing", "Influencer Credibility and Purchase Intention for D2C Beauty Brands in Tier-2 Cities", "influencer marketing; D2C; credibility"),
    ("Marketing", "Vernacular Content and Brand Engagement on Short-Video Platforms", "vernacular marketing; social media; engagement"),
    ("Marketing", "Quick Commerce and the Changing Grocery Basket of Urban Indian Households", "quick commerce; consumer behaviour; retail"),
    ("HR & Organizational Behaviour", "Hybrid Work and Employee Well-being in Indian IT Services Firms", "hybrid work; well-being; IT services"),
    ("HR & Organizational Behaviour", "Psychological Safety as a Mediator between Inclusive Leadership and Innovation", "inclusive leadership; psychological safety; innovation"),
    ("HR & Organizational Behaviour", "Gig Worker Commitment: A Study of Food Delivery Partners in Ahmedabad", "gig economy; commitment; platform work"),
    ("Operations & Supply Chain", "Resilience of Pharmaceutical Supply Chains after API Import Disruptions", "supply chain resilience; pharma; risk"),
    ("Operations & Supply Chain", "Last-Mile Delivery Optimisation using EV Fleets: A Case of Indian E-commerce", "last-mile; electric vehicles; routing"),
    ("Operations & Supply Chain", "Lean Practices and Performance in Gujarat's Textile MSMEs", "lean manufacturing; MSME; textiles"),
    ("Business Analytics & AI", "Generative AI Adoption in Indian Banks: A Technology-Organisation-Environment Analysis", "generative AI; banking; TOE framework"),
    ("Business Analytics & AI", "Predicting Customer Churn in Telecom using Explainable Machine Learning", "churn prediction; XAI; SHAP"),
    ("Business Analytics & AI", "Algorithmic Bias in AI-based Hiring Tools: Perceptions of Indian Job Seekers", "AI ethics; hiring; algorithmic bias"),
    ("Strategy & Entrepreneurship", "Founder Background and Funding Success of Indian Deep-Tech Startups", "entrepreneurship; venture capital; deep-tech"),
    ("Strategy & Entrepreneurship", "Family Business Succession and Strategic Renewal in Indian Conglomerates", "family business; succession; strategy"),
    ("Strategy & Entrepreneurship", "Platform Ecosystems and Co-opetition in Indian Mobility Startups", "platform strategy; co-opetition; ecosystems"),
    ("Economics & Public Policy", "Effect of GST Rationalisation on Inter-State Trade Flows", "GST; trade; public finance"),
    ("Economics & Public Policy", "MGNREGA Wages and Rural Consumption Smoothing: A District-Level Panel Study", "rural economics; MGNREGA; consumption"),
    ("Economics & Public Policy", "Production-Linked Incentive Schemes and Electronics Manufacturing Growth", "industrial policy; PLI; manufacturing"),
    ("Sustainability & ESG", "Green Bonds in India: Pricing, Greenium and Investor Demand", "green bonds; sustainable finance; greenium"),
    ("Sustainability & ESG", "Circular Economy Practices among Indian Plastic Packaging Firms", "circular economy; packaging; EPR"),
    ("Sustainability & ESG", "Corporate Carbon Disclosure and Firm Value: Evidence from BRSR Reports", "carbon disclosure; BRSR; firm value"),
]

AUTHORS = [
    "Aarav Sharma", "Diya Patel", "Ishaan Gupta", "Riya Shah", "Kabir Verma", "Saanvi Reddy",
    "Vihaan Choudhary", "Anika Menon", "Reyansh Agarwal", "Myra Banerjee", "Advait Pillai", "Kiara Sinha",
    "Arnav Saxena", "Navya Kapoor", "Dhruv Mishra", "Tara Bose", "Aditya Rathod", "Ira Jain",
    "Krish Parmar", "Zoya Qureshi", "Yash Thakkar", "Meher Gill", "Rudra Pandya", "Aisha Khan",
]

AFFILIATIONS = [
    "Institute of Management, Nirma University", "IIM Indore", "Symbiosis Institute of Business Management",
    "MICA Ahmedabad", "Gujarat University", "NMIMS Mumbai", "IIT Bombay (SJMSOM)", "Christ University",
    "Pandit Deendayal Energy University", "XLRI Jamshedpur", "Amity Business School", "IIM Udaipur",
]

ABSTRACT_TMPL = (
    "This paper investigates {topic} in the Indian context. Using {method}, the study analyses data from {sample}. "
    "Results indicate {finding}. The findings contribute to the literature on {kw} and offer "
    "practical implications for managers and policy makers in emerging economies."
)
METHODS = ["structural equation modelling", "a panel regression framework", "a mixed-methods design",
           "difference-in-differences estimation", "machine learning classifiers", "a multiple case study approach"]
SAMPLES = ["412 survey respondents", "a panel of 280 listed firms (2015-2025)", "28 in-depth interviews",
           "1.2 million transaction records", "district-level data for 640 districts", "312 MSMEs"]
FINDINGS = ["a significant positive relationship", "a non-linear effect moderated by firm size",
            "strong heterogeneity across regions", "a robust negative association",
            "partial mediation through trust", "short-term gains that fade over time"]


def slug_email(name, domain):
    first, last = name.lower().replace("dr. ", "").split(" ", 1)
    return f"{first}.{last.replace(' ', '')}@{domain}"


def main():
    faculty = [{
        "id": "MASTER",
        "name": "NICOM Conference Office",
        "email": "nicom.admin@example.edu",
        "role": "master",
        "domains": [],
        "maxLoad": 0,
    }]
    for i, (name, domains) in enumerate(FACULTY, start=1):
        faculty.append({
            "id": f"FAC{i:02d}",
            "name": name,
            "email": slug_email(name, "example.edu"),
            "role": "faculty",
            "domains": domains,
            "maxLoad": 5,
        })

    start = datetime(2026, 9, 1, 9, 0)
    papers = []
    for i, ((domain, title, kw), author) in enumerate(zip(PAPERS, AUTHORS), start=1):
        co = random.sample([a for a in AUTHORS if a != author], k=random.choice([0, 1, 2]))
        papers.append({
            "id": f"NICOM26-{i:03d}",
            "submittedAt": (start + timedelta(days=i, hours=random.randint(0, 9))).isoformat(),
            "title": title,
            "domain": domain,
            "keywords": kw,
            "abstract": ABSTRACT_TMPL.format(
                topic=", ".join(k.strip() for k in kw.split(";")[:-1]) + " and " + kw.split(";")[-1].strip(), method=random.choice(METHODS),
                sample=random.choice(SAMPLES), finding=random.choice(FINDINGS), kw=kw.split(";")[0]),
            "authorName": author,
            "email": slug_email(author, "example.com"),
            "phone": f"9{random.randint(100000000, 999999999)}",
            "affiliation": random.choice(AFFILIATIONS),
            "coAuthors": ", ".join(co),
            "driveLink": "",
        })

    Path("data").mkdir(exist_ok=True)
    Path("data/dummy_source.json").write_text(json.dumps({"domains": DOMAINS, "faculty": faculty, "papers": papers}, indent=2))
    print(f"wrote {len(papers)} papers, {len(faculty)} users")


if __name__ == "__main__":
    main()

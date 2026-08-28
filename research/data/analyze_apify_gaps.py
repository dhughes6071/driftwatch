#!/usr/bin/env python3
"""
Where is the legitimately-buildable demand on Apify?

Run:  python3 research/data/analyze_apify_gaps.py research/data/apify_store_2026-08-28.json

The question this answers is not "what is popular" -- it is "what could I
build without breaching a platform's terms of service, and is anyone
underserving it". Those turn out to be very different sets.

The PROHIBITED list below is a judgement call, and deliberately broad: it
covers platforms whose terms forbid automated collection, plus bulk
personal-contact harvesting, which carries GDPR/CCPA exposure regardless of
any single platform's terms. Adjust it and re-run if you disagree -- the
point is that the filter is explicit rather than buried in a conclusion.
"""
import json, sys, collections

PROHIBITED = [
    # Platforms whose ToS forbid automated collection
    "instagram", "tiktok", "facebook", "linkedin", "twitter", "tweet", "youtube",
    "threads", "truthsocial", "douyin", "xiaohongshu",
    "amazon", "ebay", "walmart", "etsy", "aliexpress",
    "zillow", "airbnb", "booking", "redfin", "realtor", "idealista", "rightmove", "otodom",
    "indeed", "glassdoor", "naukri", "yelp", "tripadvisor", "google",
    "apollo", "crunchbase",
    # Bulk personal-data harvesting -- privacy exposure independent of ToS
    "leads", "email",
]

def prohibited(a):
    t = ((a.get("title") or "") + " " + (a.get("name") or "")).lower()
    return any(k in t for k in PROHIBITED)

def u(a):      return a.get("users30d") or 0
def rating(a): return a.get("rating") or 0
def revs(a):   return a.get("reviews") or 0
def free(a):   return (a.get("pricingModel") or "FREE") == "FREE"

def main(path):
    d = json.load(open(path))
    total   = sum(u(a) for a in d)
    pro     = sum(u(a) for a in d if prohibited(a))
    legit   = [a for a in d if not prohibited(a)]
    legdem  = sum(u(a) for a in legit)
    legfree = sum(u(a) for a in legit if free(a))

    print(f"actors:                            {len(d):>9,}")
    print(f"total monthly users:               {total:>9,}")
    print(f"  on ToS-prohibited targets:       {pro:>9,}  ({pro/total*100:.1f}%)")
    print(f"  legitimately buildable:          {legdem:>9,}  ({legdem/total*100:.1f}%)")
    print(f"    of which on FREE actors:       {legfree:>9,}")
    print(f"    paid AND legitimate:           {legdem-legfree:>9,}  ({(legdem-legfree)/total*100:.1f}% of store)")

    # A real opening needs demand AND a weak incumbent. Require enough reviews
    # that the rating means something -- a 2-star actor with 1 review does not.
    pool = [a for a in legit if u(a) >= 100]
    weak = [a for a in pool if 0 < rating(a) < 4.0 and revs(a) >= 10]
    print(f"\nlegitimate actors with >=100 monthly users:  {len(pool)}")
    print(f"  of those rated <4.0 with >=10 reviews:     {len(weak)}")

    print("\nbiggest legitimate PAID actors (the competition):")
    for a in sorted([x for x in pool if not free(x)], key=u, reverse=True)[:12]:
        print(f"  {u(a):>6}u  {rating(a):.2f}*  {(a.get('title') or '')[:58]}")

if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "research/data/apify_store_2026-08-28.json")

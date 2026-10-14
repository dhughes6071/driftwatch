"""Builds research/posts/kaggle-form-d-notebook.ipynb (the starter notebook for the Form D Kaggle sample)."""
import nbformat as nbf

nb = nbf.v4.new_notebook()
md, code = nbf.v4.new_markdown_cell, nbf.v4.new_code_cell
C = []

C.append(md("""# Who just raised money? 1,314 US private rounds from SEC Form D

This notebook explores the [US Private Funding Rounds - SEC Form D](https://www.kaggle.com/datasets/dhughes6071/us-private-funding-rounds-sec-form-d-oct-2026)
sample: every new Form D filed by a US operating company between 15 Sep and 14 Oct 2026, one row per company,
with investment funds and amendments left out.

It answers four quick questions:

1. Which sectors and states are raising?
2. How big are the rounds?
3. How young are the companies, and what do they sell (equity, debt, SAFEs)?
4. Who raised the most this month?"""))

C.append(code("""import glob
import pandas as pd
import matplotlib.pyplot as plt
from matplotlib.ticker import FuncFormatter

# On Kaggle the file sits under /kaggle/input; elsewhere, next to the notebook.
path = (glob.glob("/kaggle/input/**/form-d-sample-*.csv", recursive=True)
        or glob.glob("form-d-sample-*.csv"))[0]
rounds = pd.read_csv(path, parse_dates=["filedAt", "firstSaleDate"])
plt.rcParams.update({"figure.figsize": (9, 4.5), "axes.spines.top": False, "axes.spines.right": False})
usd = FuncFormatter(lambda v, _: f"${v/1e6:,.0f}M" if v >= 1e6 else f"${v/1e3:,.0f}k")
rounds[["companyName", "filedAt", "sector", "state", "totalOfferingAmount", "totalAmountSold", "securitiesOffered"]].head()"""))

C.append(code("""raised = rounds["totalAmountSold"].fillna(0)
print(f"{len(rounds):,} companies filed a new Form D between {rounds['filedAt'].min():%d %b} and {rounds['filedAt'].max():%d %b %Y}")
print(f"{(raised > 0).sum():,} reported money already raised: ${raised.sum()/1e9:,.1f}B in total, "
      f"median ${raised[raised > 0].median()/1e6:,.2f}M")
print(f"{(raised >= 1e6).sum():,} raised $1M or more; {(raised >= 10e6).sum():,} raised $10M or more")"""))

C.append(md("""## 1. Sectors and states

The sector is the one the company ticked on the form. "Real Estate" includes many single-property LLCs raising for
one deal, and "Other" is a large catch-all, so filter on these if you are looking for startups."""))

C.append(code("""by_sector = (rounds.groupby("sector")
             .agg(companies=("cik", "size"), median_raised=("totalAmountSold", lambda s: s[s > 0].median()))
             .sort_values("companies", ascending=False))
ax = by_sector["companies"].plot.barh(color="#1e1b4b")
ax.invert_yaxis(); ax.set_xlabel("companies"); ax.set_ylabel(""); ax.set_title("New raises by sector")
plt.show()
by_sector.style.format({"median_raised": "${:,.0f}"})"""))

C.append(code("""top_states = rounds["state"].value_counts().head(12)
ax = top_states.plot.bar(color="#f4b544")
ax.set_title("Top 12 states by business address"); ax.set_ylabel("companies"); ax.set_xlabel("")
plt.show()"""))

C.append(md("""## 2. How big are the rounds?

`totalAmountSold` is what the company has raised so far in the round; `totalOfferingAmount` is its target
(empty when the target is "indefinite"). Round sizes span five orders of magnitude, so the chart uses a log scale."""))

C.append(code("""sold = rounds.loc[rounds["totalAmountSold"] > 0, "totalAmountSold"]
bins = [10**x for x in [3, 4, 5, 5.5, 6, 6.5, 7, 7.5, 8, 9, 10]]
ax = sold.plot.hist(bins=bins, color="#1e1b4b")
ax.set_xscale("log"); ax.xaxis.set_major_formatter(usd)
ax.set_title(f"Amount raised so far ({len(sold):,} companies)"); ax.set_xlabel("USD, log scale"); ax.set_ylabel("companies")
plt.show()

bands = pd.cut(sold, [0, 250e3, 1e6, 5e6, 20e6, float("inf")],
               labels=["under $250k", "$250k-1M", "$1-5M", "$5-20M", "$20M+"])
bands.value_counts().sort_index().to_frame("companies")"""))

C.append(md("""## 3. Young companies, and what they sell

The form gives a year of incorporation only for companies under five years old. `securitiesOffered` shows
what investors got: equity, debt, options, or something else, where SAFEs (simple agreements for future equity)
usually appear."""))

C.append(code("""young = rounds["yearOfIncorporation"].dropna().astype(int)
ax = young.value_counts().sort_index().plot.bar(color="#f4b544")
ax.set_title(f"Year founded ({len(young):,} companies under five years old)"); ax.set_xlabel(""); ax.set_ylabel("companies")
plt.show()

securities = rounds["securitiesOffered"].fillna("").str.split("; ").explode()
kind = securities.str.replace(r"^Other:.*(SAFE|Future Equity).*$", "SAFE (described under Other)", regex=True, case=False)
kind = kind.str.replace(r"^Other:.*$", "Other", regex=True)
kind[kind != ""].value_counts().to_frame("companies")"""))

C.append(code("""# Rule 506(c) lets a company advertise its round publicly; 506(b) does not.
exemptions = rounds["exemptions"].fillna("").str.split("; ").explode()
exemptions[exemptions != ""].value_counts().head(6).to_frame("companies")"""))

C.append(md("""## 4. The largest raises this month

Company-level only. The dataset also names each company's executives (as published on the public form) in
`executivesText`."""))

C.append(code("""cols = ["companyName", "sector", "city", "state", "totalAmountSold", "totalOfferingAmount", "filedAt"]
(rounds.sort_values("totalAmountSold", ascending=False)[cols].head(15)
       .style.format({"totalAmountSold": "${:,.0f}", "totalOfferingAmount": "${:,.0f}", "filedAt": "{:%Y-%m-%d}"}, na_rep="indefinite"))"""))

C.append(code("""# Young tech companies that raised $1M+: a typical "who just got funded" lead list
leads = rounds[(rounds["sector"] == "Technology") & (rounds["yearOfIncorporation"] >= 2023) & (rounds["totalAmountSold"] >= 1e6)]
print(f"{len(leads)} young tech companies raised $1M or more this month")
leads[["companyName", "city", "state", "totalAmountSold", "filedAt"]].sort_values("totalAmountSold", ascending=False).head(10)\\
    .style.format({"totalAmountSold": "${:,.0f}", "filedAt": "{:%Y-%m-%d}"})"""))

C.append(md("""## Going further

This is a one-month sample. The [Recently Funded Companies (SEC Form D) actor](https://apify.com/viridian_layout_ea2/sec-form-d-funding-tracker)
on Apify runs the same extraction for any date range back to 2001, filtered by sector, state, amount raised,
round size, founding year or name keyword, and can return only the companies that are new since your last run
(useful for a weekly lead list). It costs $20 per 1,000 filings.

Source: US Securities and Exchange Commission, EDGAR. Questions or a custom extract:
chazmichael_michaels@icloud.com (CMM Research)."""))

nb["cells"] = C
nb["metadata"]["kernelspec"] = {"name": "python3", "display_name": "Python 3", "language": "python"}
nbf.write(nb, "research/posts/kaggle-form-d-notebook.ipynb")
print("wrote", len(C), "cells")

"""Builds research/posts/kaggle-shopify-notebook.ipynb (the starter notebook for the Shopify stores Kaggle sample)."""
import nbformat as nbf

nb = nbf.v4.new_notebook()
md, code = nbf.v4.new_markdown_cell, nbf.v4.new_code_cell
C = []

C.append(md("""# What runs on Shopify? 10,000 live stores, their apps, themes and prices

This notebook explores the [Shopify Stores - Apps, Themes, Prices](https://www.kaggle.com/datasets/dhughes6071/shopify-stores-apps-themes-prices-oct-2026)
sample: 10,000 live Shopify stores picked at random from an index of 188,000+, each checked in October 2026.

It answers four quick questions:

1. Where are the stores, and what currencies do they sell in?
2. Which apps and themes are most popular?
3. How big are the catalogs, and what do things cost?
4. Which stores are actively adding products?"""))

C.append(code("""import glob
import pandas as pd
import matplotlib.pyplot as plt

# On Kaggle the file sits under /kaggle/input; elsewhere, next to the notebook.
path = (glob.glob("/kaggle/input/**/shopify-stores-sample-*.csv", recursive=True)
        or glob.glob("shopify-stores-sample-*.csv"))[0]
stores = pd.read_csv(path, parse_dates=["newest_product_at", "first_seen_at"], keep_default_na=False, na_values=[""])
plt.rcParams.update({"figure.figsize": (9, 4.5), "axes.spines.top": False, "axes.spines.right": False})
stores[["domain", "name", "country", "currency", "product_count", "price_median", "theme", "apps"]].head()"""))

C.append(code("""print(f"{len(stores):,} stores in {stores['country'].nunique()} countries")
print(f"{stores['has_email'].mean():.0%} publish an email address, {stores['has_phone'].mean():.0%} a phone number")
print(f"{(stores['products_added_last_30_days'] > 0).mean():.0%} added at least one product in the last 30 days")"""))

C.append(md("""## 1. Where are the stores?

`country` is the business's own country, as the store publishes it."""))

C.append(code("""ax = stores["country"].value_counts().head(15).plot.bar(color="#1e1b4b")
ax.set_title("Top 15 countries"); ax.set_ylabel("stores"); ax.set_xlabel("")
plt.show()
stores["currency"].value_counts().head(10).to_frame("stores")"""))

C.append(md("""## 2. Apps and themes

`apps` lists the apps detected on each storefront (email marketing, reviews, subscriptions, buy-now-pay-later,
page builders and more), separated by `|`."""))

C.append(code("""apps = stores["apps"].dropna().str.split("|").explode()
share = (apps.value_counts() / len(stores)).head(15)
ax = share.sort_values().plot.barh(color="#f4b544")
ax.set_title("Share of stores using each app"); ax.xaxis.set_major_formatter(lambda v, _: f"{v:.0%}")
plt.show()"""))

C.append(code("""themes = stores["theme"].value_counts().head(12)
ax = themes.sort_values().plot.barh(color="#1e1b4b")
ax.set_title("Most common themes"); ax.set_xlabel("stores")
plt.show()"""))

C.append(md("""Which email tools do stores pair with which review apps? A quick cross-tab:"""))

C.append(code("""email_tools = ["Klaviyo", "Mailchimp", "Omnisend", "Privy"]
review_tools = ["Judge.me", "Yotpo", "Loox", "Okendo", "Stamped"]
has = lambda tool: stores["apps"].fillna("").str.split("|").apply(lambda a: tool in a)
pd.DataFrame({e: [(has(e) & has(r)).sum() for r in review_tools] for e in email_tools}, index=review_tools)"""))

C.append(md("""## 3. Catalog size and prices

Prices are in each store's own currency, so compare within one currency."""))

C.append(code("""usd = stores[stores["currency"] == "USD"]
ax = usd["price_median"].clip(upper=300).plot.hist(bins=60, color="#1e1b4b")
ax.set_title(f"Typical product price, USD stores ({len(usd):,})"); ax.set_xlabel("median price (USD, capped at 300)")
plt.show()

bands = pd.cut(stores["product_count"], [0, 10, 50, 250, 1000, float("inf")],
               labels=["1-10", "11-50", "51-250", "251-1,000", "1,000+"])
bands.value_counts().sort_index().to_frame("stores")"""))

C.append(md("""## 4. Who is actively growing?

`products_added_last_30_days` counts products published in the 30 days before the check: a good signal of a store
that is trading and investing, not just still online."""))

C.append(code("""growing = stores[stores["products_added_last_30_days"] >= 10].sort_values("products_added_last_30_days", ascending=False)
print(f"{len(growing):,} stores added 10 or more products in the last 30 days")
growing[["domain", "name", "country", "product_count", "products_added_last_30_days", "top_product_type", "apps"]].head(15)"""))

C.append(md("""## The full data

This sample leaves out the stores' published emails and phone numbers. The full index of 188,000+ live stores,
re-checked every two weeks and searchable by niche, country, catalog size, price, activity, theme and app, with
contact details, is the [Shopify Store Leads](https://apify.com/viridian_layout_ea2/shopify-store-leads) Actor
on Apify."""))

nb["cells"] = C
nb["metadata"]["kernelspec"] = {"name": "python3", "display_name": "Python 3", "language": "python"}
nbf.write(nb, "research/posts/kaggle-shopify-notebook.ipynb")
print("wrote research/posts/kaggle-shopify-notebook.ipynb")

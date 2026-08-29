# Country Comparison Indices — Globe App Content

Handoff reference for building "rich content" comparators into the globe app (geography-learner audience). Each index below gives a single thought-provoking dimension per country, sourced from a credible publisher we can link out to.

## Two flavours (affects how to surface in the app)

- **Hard indices** (#2, #3, #5, #7, #8, #9, #10): one clean value per country covering most/all of the world. Bind to a colour scale or a country-click panel.
- **Attitudinal surveys** (#1, #4, #6): limited to ~30–40 surveyed countries. Better as a "did you know" card than a full-globe colour layer.

## Licensing note

For the survey-based entries especially, check licensing before pulling figures into the app. Linking out to the source (current plan) sidesteps most of this; reproducing or redistributing their datasets may not be free to use. Verify per source.

---

## 1. Nostalgia / "the past was better"
- **Publisher:** Ipsos
- **Measures:** Agreement that the country should go back to how it "used to be" (Global Trends 2021); 2025 refresh asks whether people would rather have been born in 1975 than today.
- **Why it's interesting:** Cuts against national stereotypes. Ireland scored second-lowest for nostalgia in 2021, China lowest.
- **Coverage:** ~30 countries (attitudinal survey).
- **Link:** https://www.ipsos.com/en/global-trends
- **Secondary write-up (accessible):** https://www.irishtimes.com/life-and-style/fintan-o-toole-other-countries-yearn-for-the-good-old-days-not-ireland-1.4725723
- **2025 refresh:** https://www.ipsos.com/en-uk/widespread-nostalgia-old-days-many-saying-things-were-better-back-1975

## 2. World Happiness Report
- **Publisher:** Wellbeing Research Centre (University of Oxford) + Gallup + UN SDSN
- **Measures:** 0–10 life-evaluation score (Cantril ladder), three-year averaged.
- **Why it's interesting:** The gold-standard "how's life" comparator. Finland has led for 8 straight years; Ireland ~15th.
- **Coverage:** 140+ countries (hard index).
- **Link:** https://worldhappiness.report

## 3. Henley Passport Index
- **Publisher:** Henley & Partners (data from IATA)
- **Measures:** Number of destinations a passport can enter visa-free / visa-on-arrival.
- **Why it's interesting:** Very visual on a globe. Singapore leads (~193 destinations); the US recently dropped out of the top 10 for the first time in two decades.
- **Coverage:** 199 passports vs 227 destinations (hard index).
- **Link:** https://www.henleyglobal.com/passport-index

## 4. Perils of Perception
- **Publisher:** Ipsos
- **Measures:** How wrong a country's public is about basic facts (immigrant numbers, murder rates, wealth distribution, religiosity, happiness).
- **Why it's interesting:** Strong "test yourself vs. your country" hook. Across 40 countries, people guessed on average 44% say they're happy when the real figure was ~86%.
- **Coverage:** ~37–40 countries (attitudinal survey).
- **Link:** https://www.ipsos.com/en/perils

## 5. The Big Mac Index
- **Publisher:** The Economist
- **Measures:** Currency over/undervaluation vs USD via the price of one standardised Big Mac (purchasing-power parity).
- **Why it's interesting:** Accessible way to teach purchasing power. Prices range from ~$2.38 (Taiwan) to ~$7.99 (Switzerland).
- **Coverage:** ~60 countries, published twice yearly (hard-ish index).
- **Link:** https://www.economist.com/big-mac-index

## 6. Good Country Index
- **Publisher:** Simon Anholt
- **Measures:** What each country contributes to humanity *outside its own borders*, relative to its size (science, culture, peace, world order, sustainability, etc.).
- **Why it's interesting:** A values-led counterpoint to GDP. Ireland has topped it.
- **Coverage:** ~160–174 countries (composite index from external datasets).
- **Link:** https://goodcountry.org/index

## 7. Corruption Perceptions Index
- **Publisher:** Transparency International
- **Measures:** 0–100 perceived public-sector "cleanliness" score, updated annually.
- **Why it's interesting:** Stable, widely cited, easy to colour a map with.
- **Coverage:** ~180 countries (hard index).
- **Link:** https://www.transparency.org/en/cpi

## 8. Democracy Index
- **Publisher:** Economist Intelligence Unit (EIU)
- **Measures:** 0–10 score, bucketed into full democracy / flawed democracy / hybrid / authoritarian.
- **Why it's interesting:** Good for a categorical globe layer (4 colour bands).
- **Coverage:** ~165 countries (hard index).
- **Link:** https://www.eiu.com/n/campaigns/democracy-index/

## 9. Global Peace Index
- **Publisher:** Institute for Economics & Peace
- **Measures:** Peacefulness score (conflict, societal safety, militarisation).
- **Why it's interesting:** Iceland has led for years; strong contrast layer. 
- **Coverage:** ~160+ countries (hard index).
- **Link:** https://www.visionofhumanity.org

## 10. World Press Freedom Index
- **Publisher:** Reporters Without Borders (RSF)
- **Measures:** Press-freedom score per country.
- **Why it's interesting:** Strong colour gradient that maps beautifully.
- **Coverage:** ~180 countries (hard index).
- **Link:** https://rsf.org

---

## Next step (open question for the build)

For the hard indices, decide whether to link out only or pull data in. If pulling in, we'll need per-source data access: some offer CSV/Excel downloads (World Happiness Report, CPI, Big Mac Index via GitHub), others require scraping or manual entry. Worth confirming endpoints before wiring the globe colour layers.

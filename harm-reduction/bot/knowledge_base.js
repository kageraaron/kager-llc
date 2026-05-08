const knowledgeBase = [
  {
    topic: "3 Month Rule / MDMA Frequency",
    keywords: [
      /how often (can|should) (i|you) (roll|take mdma|do mdma)/i,
      /3 month rule/i,
      /rolling (every|two) (week|weekend)/i
    ],
    response: `The harm reduction gold standard for MDMA is the **3-Month Rule**. This allows your brain's serotonin transporters and receptors to fully recover and return to baseline levels.

While some users roll more frequently, research shows that cumulative exposure and short intervals between uses significantly increase the risk of long-term neurotoxicity and "losing the magic". At an absolute minimum, wait 4-6 weeks, but 3 months is the safest recommended interval.

You can read more about MDMA safety and best practices on our [Rave Wellness FAQ](https://www.ravewellness.org/faq.html).`
  },
  {
    topic: "MDMA and SSRIs",
    keywords: [
      /(mdma|molly|ecstasy) and (ssri|lexapro|zoloft|prozac|antidepressant)/i,
      /on (ssri|lexapro|zoloft|prozac).*can i (roll|take mdma)/i
    ],
    response: `**Generally, you should not mix MDMA with SSRIs.** 

Combining MDMA with Selective Serotonin Reuptake Inhibitors (SSRIs) like Lexapro, Zoloft, or Prozac is dangerous and usually ineffective. SSRIs block the serotonin transporter that MDMA needs to work. More importantly, this combination risks **Serotonin Syndrome**, which can be fatal.

Never stop your prescription medication just to roll without consulting your doctor, as SSRI withdrawal can be severe.

For more information, check out the [MDMA FAQ at Rave Wellness](https://www.ravewellness.org/faq.html).`
  },
  {
    topic: "Testing LSD",
    keywords: [
      /how (to|do i) test (lsd|acid)/i,
      /(lsd|acid) test kit/i,
      /nbome/i
    ],
    response: `To test LSD, you should use the **Ehrlich Reagent** (which should turn purple, confirming an indole compound like LSD) and the **Hofmann Reagent** (which turns blue specifically for LSD). 

It's critical to test for NBOMe compounds, which can be lethal at high doses and are often sold as "acid." Remember the saying: *"If it's bitter, it's a spitter."* Real LSD has no taste.

Learn more about safe testing practices and find reputable test kits on our [Test Kits Guide](https://www.ravewellness.org/test-kits.html).`
  },
  {
    topic: "Candy Flipping",
    keywords: [
      /candy flip/i,
      /mixing (lsd|acid) and (mdma|molly)/i
    ],
    response: `Candy flipping (mixing LSD and MDMA) can be intense. Here are some harm reduction tips if you choose to do it:

1. **Stagger the doses:** Take the LSD first, followed by the MDMA 3-4 hours later to align the peaks.
2. **Lower your doses:** Because the two drugs potentiate each other, take a lower dose of each than you normally would.
3. **Stay hydrated:** The physical strain of both compounds increases the risk of dehydration and overheating.

Read more about festival safety and combinations on the [Rave Wellness FAQ](https://www.ravewellness.org/faq.html).`
  },
  {
    topic: "Naloxone / Narcan",
    keywords: [
      /where (to|can i) get (narcan|naloxone)/i,
      /how to use (narcan|naloxone)/i,
      /overdose response/i
    ],
    response: `**Naloxone (Narcan) saves lives.** If you suspect an opioid overdose (unresponsive, very slow breathing, blue/gray lips):

1. Call 911 immediately.
2. Lay the person on their back, tilt head back.
3. Insert nozzle into one nostril and press plunger firmly.
4. If no response in 2-3 minutes, give the second dose in the other nostril.

You can get Naloxone for free in many states by mail via [NEXT Distro](https://nextdistro.org/naloxone), or purchase it OTC at pharmacies like CVS or Walgreens.

For a full guide on overdose response, see our [Emergency Resources](https://www.ravewellness.org/faq.html).`
  }
];

module.exports = knowledgeBase;

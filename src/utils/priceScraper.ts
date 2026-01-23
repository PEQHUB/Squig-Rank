async function getIEMPrice(iemName: string): Promise<number | null> {
  const sources = [
    scrapeAmazon,
    scrapeHeadphonesDotCom
  ];

  for (const source of sources) {
    try {
      const price = await Promise.race([
        source(iemName),
        new Promise<number | null>((_, reject) =>
          setTimeout(() => reject(new Error('Timeout')), 500)
        )
      ]);
      if (price !== null) return price;
    } catch (error) {
      continue;
    }
  }

  return null;
}

async function scrapeAmazon(iemName: string): Promise<number | null> {
  try {
    const searchTerm = encodeURIComponent(`${iemName} IEM`);
    const response = await fetch(`https://www.amazon.com/s?k=${searchTerm}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });

    if (!response.ok) return null;

    const text = await response.text();

    const priceRegex = /\$\s*([\d,]+\.?\d*)/g;
    const matches = text.match(priceRegex);

    if (matches && matches.length > 0) {
      const priceStr = matches[0].replace(/[$,]/g, '');
      return parseFloat(priceStr);
    }

    return null;
  } catch (error) {
    return null;
  }
}

async function scrapeHeadphonesDotCom(iemName: string): Promise<number | null> {
  try {
    const searchTerm = encodeURIComponent(iemName);
    const response = await fetch(`https://headphones.com/search?q=${searchTerm}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });

    if (!response.ok) return null;

    const text = await response.text();

    const priceRegex = /\$\s*([\d,]+\.?\d*)/g;
    const matches = text.match(priceRegex);

    if (matches && matches.length > 0) {
      const priceStr = matches[0].replace(/[$,]/g, '');
      return parseFloat(priceStr);
    }

    return null;
  } catch (error) {
    return null;
  }
}

export { getIEMPrice };

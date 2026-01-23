import { calculateSimilarity } from '../src/utils/correlationCalculator';
import { alignToR40 } from '../src/utils/frequencyAlignment';
import { scanAllDomains } from '../src/utils/scraper';
import { loadTargetCurve } from '../src/utils/targetParser';
import { getIEMPrice } from '../src/utils/priceScraper';
import { CalculationResult } from '../src/types';

export const config = { maxDuration: 5 };

export default async function handler(req: any, res: any) {
  const targets = req.query.targets || 'target1,target2';
  const targetList = targets.toString().split(',');

  const targetCurves = await Promise.all(
    targetList.map(async (target: string) => ({
      name: target,
      curve: await loadTargetCurve(target)
    }))
  );

  const allIEMs = await scanAllDomains();

  const results = await Promise.all(
    targetCurves.map(async (target) => {
      const scoredIEMs = await Promise.all(
        allIEMs.map(async (iem) => {
          const iemR40 = alignToR40(iem.frequencyData);
          const targetR40 = alignToR40(target.curve);
          const similarity = calculateSimilarity(iemR40, targetR40);
          const price = await getIEMPrice(iem.name);

          return {
            ...iem,
            similarity,
            price
          };
        })
      );

      scoredIEMs.sort((a, b) => {
        if (b.similarity !== a.similarity) {
          return b.similarity - a.similarity;
        }
        return (a.price ?? Infinity) - (b.price ?? Infinity);
      });

      return {
        targetName: target.name,
        top25: scoredIEMs.slice(0, 25)
      };
    })
  );

  return res.status(200).json(results);
}

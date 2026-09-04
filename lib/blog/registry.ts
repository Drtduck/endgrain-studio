import { meta as kerfIPripuski } from '@/content/blog/kerf-i-pripuski.mdx'
import { meta as kerfIPripuskiEn } from '@/content/blog/kerf-i-pripuski-en.mdx'
import { meta as vyborPorod } from '@/content/blog/vybor-porod.mdx'
import { meta as vyborPorodEn } from '@/content/blog/vybor-porod-en.mdx'
import { meta as shemaPerekleyki } from '@/content/blog/shema-perekleyki.mdx'
import { meta as shemaPerekleykiEn } from '@/content/blog/shema-perekleyki-en.mdx'
import { meta as shirinaPolosVtoroySkleyki } from '@/content/blog/shirina-polos-vtoroy-skleyki.mdx'
import { meta as shirinaPolosVtoroySkleykiEn } from '@/content/blog/shirina-polos-vtoroy-skleyki-en.mdx'
import { meta as freeEndGrainDesignTool } from '@/content/blog/free-end-grain-design-tool.mdx'
import { meta as freeEndGrainDesignToolRu } from '@/content/blog/free-end-grain-design-tool-ru.mdx'
import { meta as realCostEndGrainBoard } from '@/content/blog/real-cost-end-grain-cutting-board.mdx'
import { meta as realCostEndGrainBoardRu } from '@/content/blog/real-cost-end-grain-cutting-board-ru.mdx'
import { meta as checkerboard3dCubeStripWidths } from '@/content/blog/checkerboard-3d-cube-strip-widths.mdx'
import { meta as checkerboard3dCubeStripWidthsRu } from '@/content/blog/checkerboard-3d-cube-strip-widths-ru.mdx'
import { meta as whyEndGrainBoardWarped } from '@/content/blog/why-end-grain-board-warped.mdx'
import { meta as whyEndGrainBoardWarpedRu } from '@/content/blog/why-end-grain-board-warped-ru.mdx'
import { meta as boardFeet12x16 } from '@/content/blog/board-feet-12x16-end-grain-board.mdx'
import { meta as boardFeet12x16Ru } from '@/content/blog/board-feet-12x16-end-grain-board-ru.mdx'
import { meta as howMuchToCharge } from '@/content/blog/how-much-to-charge-end-grain-board.mdx'
import { meta as howMuchToChargeRu } from '@/content/blog/how-much-to-charge-end-grain-board-ru.mdx'
import { meta as repeatOrderSamePattern } from '@/content/blog/repeat-order-same-pattern.mdx'
import { meta as repeatOrderSamePatternRu } from '@/content/blog/repeat-order-same-pattern-ru.mdx'
import { meta as planerEndGrainBoard } from '@/content/blog/planer-end-grain-cutting-board.mdx'
import { meta as planerEndGrainBoardRu } from '@/content/blog/planer-end-grain-cutting-board-ru.mdx'
import { meta as stepsToMakeEndGrainBoard } from '@/content/blog/steps-to-make-end-grain-cutting-board.mdx'
import { meta as stepsToMakeEndGrainBoardRu } from '@/content/blog/steps-to-make-end-grain-cutting-board-ru.mdx'
import { meta as kerfMillingWaste } from '@/content/blog/kerf-and-milling-waste-budget.mdx'
import { meta as kerfMillingWasteRu } from '@/content/blog/kerf-and-milling-waste-budget-ru.mdx'
import { meta as boardCrackedGlueLine } from '@/content/blog/board-cracked-along-glue-line.mdx'
import { meta as boardCrackedGlueLineRu } from '@/content/blog/board-cracked-along-glue-line-ru.mdx'
import { meta as losingMoneyEtsyFees } from '@/content/blog/losing-money-etsy-fees.mdx'
import { meta as losingMoneyEtsyFeesRu } from '@/content/blog/losing-money-etsy-fees-ru.mdx'
import { meta as chevronBoardAngle } from '@/content/blog/chevron-end-grain-board-angle.mdx'
import { meta as chevronBoardAngleRu } from '@/content/blog/chevron-end-grain-board-angle-ru.mdx'
import { meta as overTightenClamps } from '@/content/blog/over-tighten-clamps-starve-glue-joint.mdx'
import { meta as overTightenClampsRu } from '@/content/blog/over-tighten-clamps-starve-glue-joint-ru.mdx'
import { meta as glueJointsFailSecond } from '@/content/blog/glue-joints-fail-second-glue-up.mdx'
import { meta as glueJointsFailSecondRu } from '@/content/blog/glue-joints-fail-second-glue-up-ru.mdx'
import { meta as careCardCuttingBoard } from '@/content/blog/care-card-cutting-board.mdx'
import { meta as careCardCuttingBoardRu } from '@/content/blog/care-card-cutting-board-ru.mdx'
import { meta as endGrainVsEdgeGrain } from '@/content/blog/end-grain-vs-edge-grain.mdx'
import { meta as endGrainVsEdgeGrainRu } from '@/content/blog/end-grain-vs-edge-grain-ru.mdx'
import { meta as sevenGlueUpFailures } from '@/content/blog/seven-glue-up-failures.mdx'
import { meta as sevenGlueUpFailuresRu } from '@/content/blog/seven-glue-up-failures-ru.mdx'
import { meta as crosscutWidePanel } from '@/content/blog/crosscut-wide-panel-table-saw-sled.mdx'
import { meta as crosscutWidePanelRu } from '@/content/blog/crosscut-wide-panel-table-saw-sled-ru.mdx'
import { meta as whyBoardsExpensive } from '@/content/blog/why-end-grain-boards-expensive.mdx'
import { meta as whyBoardsExpensiveRu } from '@/content/blog/why-end-grain-boards-expensive-ru.mdx'
import { meta as keystoneFormula } from '@/content/blog/keystone-pricing-formula-cutting-boards.mdx'
import { meta as keystoneFormulaRu } from '@/content/blog/keystone-pricing-formula-cutting-boards-ru.mdx'
import type { PostMeta } from './types'

/**
 * Явный список статей вместо чтения директории через fs: итерация директории на
 * сервере ломает статическую сборку и не типизируется. Новую статью нужно дописать
 * сюда руками - lib/blog/registry.test.ts падает, если файл в content/blog есть,
 * а тут его нет, так что забыть физически не получится.
 */
export const POST_METAS: readonly PostMeta[] = [
  kerfIPripuski,
  kerfIPripuskiEn,
  vyborPorod,
  vyborPorodEn,
  shemaPerekleyki,
  shemaPerekleykiEn,
  shirinaPolosVtoroySkleyki,
  shirinaPolosVtoroySkleykiEn,
  freeEndGrainDesignTool,
  freeEndGrainDesignToolRu,
  realCostEndGrainBoard,
  realCostEndGrainBoardRu,
  checkerboard3dCubeStripWidths,
  checkerboard3dCubeStripWidthsRu,
  whyEndGrainBoardWarped,
  whyEndGrainBoardWarpedRu,
  boardFeet12x16,
  boardFeet12x16Ru,
  howMuchToCharge,
  howMuchToChargeRu,
  repeatOrderSamePattern,
  repeatOrderSamePatternRu,
  planerEndGrainBoard,
  planerEndGrainBoardRu,
  stepsToMakeEndGrainBoard,
  stepsToMakeEndGrainBoardRu,
  kerfMillingWaste,
  kerfMillingWasteRu,
  boardCrackedGlueLine,
  boardCrackedGlueLineRu,
  losingMoneyEtsyFees,
  losingMoneyEtsyFeesRu,
  chevronBoardAngle,
  chevronBoardAngleRu,
  overTightenClamps,
  overTightenClampsRu,
  glueJointsFailSecond,
  glueJointsFailSecondRu,
  careCardCuttingBoard,
  careCardCuttingBoardRu,
  endGrainVsEdgeGrain,
  endGrainVsEdgeGrainRu,
  sevenGlueUpFailures,
  sevenGlueUpFailuresRu,
  crosscutWidePanel,
  crosscutWidePanelRu,
  whyBoardsExpensive,
  whyBoardsExpensiveRu,
  keystoneFormula,
  keystoneFormulaRu,
]

import { useCallback, useMemo, useState } from 'react'
import { CircleCheck, CircleX, TriangleAlert } from 'lucide-react'
import { runExportPreflight } from '@editor/exportPreflight'
import { checksHeadline } from '@editor/severity'
import { useEditor } from './editorStore'
import { fontEnvironment, useFontCatalog } from './fontCatalog'
import { useSafeAreaReport } from './SafeAreaOverlay'
import { PreflightRow, SEVERITY_ORDER, type CheckItem } from './CheckList'
import { runCommand } from './commandRunner'
import { tipProps } from './tips'
import { Button } from '../ui/Button'
import { Popover } from '../ui/Popover'
import { Tooltip } from '../ui/Tooltip'

/**
 * The project's checks as the Export dialog lists them before a dslrBooth format is chosen: the design preflight plus
 * the Output Profile's safe-area findings. Read only; computing them never changes the project.
 */
export function useProjectChecks(): {
  items: CheckItem[]
  errors: number
  warnings: number
  infos: number
} | null {
  const project = useEditor((s) => s.project)
  const safe = useSafeAreaReport()
  const catalog = useFontCatalog()
  return useMemo(() => {
    // `catalog` is read so the checks re-run when installed fonts arrive after launch.
    if (!project || !catalog) return null
    const pre = runExportPreflight(project, { fonts: fontEnvironment() })
    const items: CheckItem[] = [
      ...pre.items,
      ...(safe?.items ?? [])
        .filter((i) => i.code !== 'output-profile-none')
        .map((i) => ({ ...i, tag: 'Output' }))
    ].sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity])
    const count = (s: CheckItem['severity']): number => items.filter((i) => i.severity === s).length
    return { items, errors: count('error'), warnings: count('warning'), infos: count('info') }
  }, [project, safe, catalog])
}

/**
 * Top-bar Checks (B3 shell access). Opens a small read-only list of the current checks; the full Checks panel is a
 * later (B4) redesign. The count shows errors + items that need attention; notes never count as problems.
 */
export function ChecksButton(): React.JSX.Element | null {
  const checks = useProjectChecks()
  const [anchor, setAnchor] = useState<HTMLElement | null>(null)
  const close = useCallback(() => setAnchor(null), [])
  if (!checks) return null
  const problems = checks.errors + checks.warnings
  const head = checksHeadline(checks)
  const Icon = checks.errors > 0 ? CircleX : problems > 0 ? TriangleAlert : CircleCheck
  return (
    <>
      <Tooltip label="Checks" {...tipProps('checks')}>
        <button
          type="button"
          id="checks-button"
          className={`ui-btn ghost checks-btn tone-${head.tone}${anchor ? ' open' : ''}`}
          aria-haspopup="dialog"
          aria-expanded={anchor !== null}
          aria-label={`Checks: ${head.text}`}
          onClick={(e) => setAnchor(anchor ? null : e.currentTarget)}
        >
          <Icon size={16} strokeWidth={1.9} aria-hidden="true" className="checks-icon" />
          <span className="label">Checks</span>
          {problems > 0 && (
            <span className="ui-count" aria-hidden="true">
              {problems}
            </span>
          )}
        </button>
      </Tooltip>
      {anchor && (
        <Popover
          anchor={anchor}
          label="Checks"
          onClose={close}
          className="checks-popover"
          testId="checks-popover"
        >
          <div className="checks-popover-head">
            <strong>Checks</strong>
            <span className={`checks-headline tone-${head.tone}`}>{head.text}</span>
          </div>
          {checks.items.length === 0 ? (
            <p className="checks-empty">No problems found.</p>
          ) : (
            <ul className="preflight-list" aria-label="Checks">
              {checks.items.map((item, i) => (
                <PreflightRow key={`${item.code}-${i}`} item={item} />
              ))}
            </ul>
          )}
          <div className="checks-popover-foot">
            <span className="muted">The Export dialog checks again for the format you choose.</span>
            <Button
              size="sm"
              onClick={() => {
                close()
                runCommand('file.export')
              }}
            >
              Export…
            </Button>
          </div>
        </Popover>
      )}
    </>
  )
}

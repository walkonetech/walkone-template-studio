import { Download, Eye, Redo2, Save, TriangleAlert, Undo2 } from 'lucide-react'
import {
  COMMANDS,
  MENUS,
  isCommandChecked,
  isCommandEnabled,
  shortcutLabel,
  type CommandContext,
  type CommandId
} from '@editor/commands'
import { hasDerivedCopies } from '@canvas/rendering/composition'
import { selectCanRedo, selectCanUndo, selectIsDirty, selectViewMode } from '@editor/store'
import { topBarPresentation } from '@editor/layout'
import { ChecksButton } from './ChecksButton'
import { useLayout } from './layoutStore'
import { runCommand } from './commandRunner'
import { commandTipProps } from './tips'
import { editorStore, useEditor } from './editorStore'
import { isMac } from './platform'
import { useAppearance } from '../appearance/appearanceStore'
import { Button } from '../ui/Button'
import { IconButton } from '../ui/IconButton'
import { MenuBar, type MenuEntry } from '../ui/Menu'
import { Tooltip } from '../ui/Tooltip'

/** Everything the command model needs to decide enablement, read from the store in one stable-ish selection. */
export function useCommandContext(): CommandContext {
  const hasProject = useEditor((s) => s.project !== null)
  const canUndo = useEditor(selectCanUndo)
  const canRedo = useEditor(selectCanRedo)
  const selectionCount = useEditor((s) => s.selectedIds.length)
  const snapping = useEditor((s) => s.snapping.enabled)
  const hasPrintPreview = useEditor((s) => s.project !== null && hasDerivedCopies(s.project))
  const viewMode = useEditor(selectViewMode)
  const showOverflow = useEditor((s) => s.showOverflow)
  // Safe areas exist with a printer profile, or with a format's generic safe margin (B5.5).
  const hasOutputProfile = useEditor(
    (s) => s.outputProfileId !== null || (s.project?.canvas.safeMarginMm ?? 0) > 0
  )
  const showSafeAreas = useEditor((s) => s.showSafeAreas)
  const showCutGuides = useEditor((s) => s.showCutGuides)
  const theme = useAppearance((s) => s.theme)
  const density = useAppearance((s) => s.density)
  return {
    hasProject,
    canUndo,
    canRedo,
    selectionCount,
    snapping,
    hasPrintPreview,
    showOverflow,
    viewMode,
    hasOutputProfile,
    showSafeAreas,
    showCutGuides,
    theme,
    density
  }
}

export const shortcutFor = (id: CommandId): string => shortcutLabel(COMMANDS[id].shortcut, isMac())

export function useMenus(ctx: CommandContext): {
  id: string
  label: string
  entries: MenuEntry[]
}[] {
  return MENUS.map((m) => ({
    id: m.id,
    label: m.label,
    entries: m.items.map((item): MenuEntry => {
      if (item === '-') return 'separator'
      return {
        id: item,
        label: COMMANDS[item].label,
        shortcut: shortcutFor(item),
        disabled: !isCommandEnabled(item, ctx),
        checked: isCommandChecked(item, ctx),
        onSelect: () => runCommand(item)
      }
    })
  }))
}

function DocumentTitle(): React.JSX.Element {
  const name = useEditor((s) => s.project?.metadata.name ?? null)
  const dirty = useEditor(selectIsDirty)
  const autosaveIssue = useEditor((s) => s.autosaveIssue)
  const autosaveState = useEditor((s) => s.autosave.state)
  if (name === null) return <div className="doc-title" />
  const issue = autosaveState === 'error' || autosaveIssue
  return (
    <div className="doc-title" role="group" aria-label="Document">
      <strong id="doc-name" title={name}>
        {name}
      </strong>
      <span
        id="doc-state"
        className={dirty ? 'modified' : 'saved'}
        title={dirty ? 'Unsaved changes' : 'All changes saved to the project file'}
      >
        <span className={`ui-dot ${dirty ? 'modified' : 'saved'}`} aria-hidden="true" />
        {dirty ? 'Modified' : 'Saved'}
      </span>
      {issue && (
        <Tooltip
          label={
            autosaveIssue ??
            'The automatic recovery copy could not be written. Save your project manually.'
          }
        >
          <span id="autosave-issue" className="ui-badge warn" role="alert" tabIndex={0}>
            <TriangleAlert size={12} aria-hidden="true" />
            &nbsp;Autosave issue
          </span>
        </Tooltip>
      )}
    </div>
  )
}

/**
 * Top bar (B1 hierarchy): menus on the left; the document name and Saved/Modified state in the centre (the name
 * ellipsizes first); Undo, Redo, Checks, See how it prints, Save and Export on the right. When the window narrows the
 * actions are protected in this order: Export, Save + state, Preview, Checks, Undo/Redo (see `topBarPresentation`).
 * Export is the one primary action and is shown at every supported size. The Start screen shows only the menus.
 */
export function TopBar(): React.JSX.Element {
  const ctx = useCommandContext()
  const menus = useMenus(ctx)
  const width = useLayout((s) => s.viewport.width)
  const density = useAppearance((s) => s.density)
  const dirty = useEditor(selectIsDirty)
  const hasFile = useEditor((s) => s.session?.fileName != null)
  const present = topBarPresentation(width, density)
  const st = editorStore.getState
  return (
    <header className="topbar" aria-label="Application bar" data-region="topbar">
      <div className="topbar-left">
        <span className="brand" aria-label="WalkOne Template Studio">
          <span className="brand-mark" aria-hidden="true" />
          {!ctx.hasProject && <span className="brand-name">Template Studio</span>}
        </span>
        <MenuBar menus={menus} label="Application menu" accessKeys={!isMac()} />
      </div>
      <DocumentTitle />
      {ctx.hasProject ? (
        <div className="topbar-right" role="toolbar" aria-label="Document actions">
          {present.undoRedoWords ? (
            <>
              <Tooltip label="Undo" {...commandTipProps('edit.undo')}>
                <Button
                  variant="ghost"
                  icon={Undo2}
                  aria-label="Undo"
                  disabled={!ctx.canUndo}
                  onClick={() => st().undo()}
                >
                  Undo
                </Button>
              </Tooltip>
              <Tooltip label="Redo" {...commandTipProps('edit.redo')}>
                <Button
                  variant="ghost"
                  icon={Redo2}
                  aria-label="Redo"
                  disabled={!ctx.canRedo}
                  onClick={() => st().redo()}
                >
                  Redo
                </Button>
              </Tooltip>
            </>
          ) : (
            <>
              <IconButton
                label="Undo"
                icon={Undo2}
                {...commandTipProps('edit.undo')}
                disabled={!ctx.canUndo}
                onClick={() => st().undo()}
              />
              <IconButton
                label="Redo"
                icon={Redo2}
                {...commandTipProps('edit.redo')}
                disabled={!ctx.canRedo}
                onClick={() => st().redo()}
              />
            </>
          )}
          <span className="ui-divider" aria-hidden="true" />
          <ChecksButton />
          <Tooltip
            label="See how it prints"
            hint={
              ctx.hasPrintPreview
                ? COMMANDS['view.printPreview'].hint
                : 'This design prints as it is: one copy per sheet, so the design view already shows the print'
            }
          >
            <Button
              icon={Eye}
              id="print-preview-button"
              aria-label="See how it prints"
              aria-pressed={ctx.viewMode === 'preview'}
              disabled={!ctx.hasPrintPreview}
              onClick={() =>
                runCommand(ctx.viewMode === 'preview' ? 'view.design' : 'view.printPreview')
              }
            >
              {present.previewLabel}
            </Button>
          </Tooltip>
          <Tooltip
            label="Save"
            {...commandTipProps('file.save')}
            {...(!dirty && hasFile ? { hint: 'All changes are saved to the project file' } : {})}
          >
            <Button
              icon={Save}
              id="save-button"
              disabled={!dirty && hasFile}
              aria-label="Save"
              onClick={() => runCommand('file.save')}
            >
              Save
            </Button>
          </Tooltip>
          <Tooltip label="Export" {...commandTipProps('file.export')}>
            <Button
              variant="primary"
              icon={Download}
              aria-label="Export"
              id="export-button"
              onClick={() => runCommand('file.export')}
            >
              Export
            </Button>
          </Tooltip>
        </div>
      ) : (
        <div className="topbar-right" />
      )}
    </header>
  )
}

/**
 * Tooltip text for controls that are NOT commands (commands carry their own `hint` and shortcut in `commands.ts`, and
 * their tooltips are derived from there so labels and shortcuts can never drift). Plain data: one place to review the
 * wording, and testable. The Tooltip component (renderer/ui/Tooltip) is the only tooltip system.
 */
export interface Tip {
  label: string
  hint: string
}

export const TIPS = {
  // canvas interaction (no button of their own: described where the user looks for them)
  move: {
    label: 'Move',
    hint: 'Drag to reposition. Hold Shift to constrain horizontally or vertically.'
  },
  pan: {
    label: 'Pan',
    hint: 'Hold Space and drag to move around the workspace. Scroll also pans; Ctrl/Cmd + scroll zooms.'
  },
  zoomLevel: {
    label: 'Zoom level',
    hint: 'Current workspace zoom. Zoom never changes the design.'
  },
  // layers panel
  addLayer: { label: 'Add layer', hint: 'Add a photo placeholder, text or shape to the design' },
  arrangeStacking: {
    label: 'Arrange',
    hint: 'Change the stacking order: bring forward, send backward, to front or back'
  },
  layerShortcuts: {
    label: 'Layer shortcuts',
    hint: 'Show the keyboard shortcuts for the Layers panel'
  },
  visibility: { label: 'Visibility', hint: 'Show or hide this layer in the design and in prints' },
  lock: { label: 'Lock', hint: 'Locked layers cannot be moved or edited on the canvas' },
  // photo workflow
  reposition: {
    label: 'Reposition photo',
    hint: 'Drag the sample photo inside its frame. Enter finishes, Escape cancels.'
  },
  resetCrop: {
    label: 'Reset position',
    hint: 'Return the sample photo to its default fit and position'
  },
  cropZoomIn: { label: 'Zoom photo in', hint: 'Magnify the sample photo inside its frame' },
  cropZoomOut: { label: 'Zoom photo out', hint: 'Shrink the sample photo back toward its fit' },
  shuffle: { label: 'Shuffle photos', hint: 'Pick a different set of sample photos' },
  resetSamples: {
    label: 'Reset samples',
    hint: 'Return to the default sample photo for each number'
  },
  chooseSample: {
    label: 'Choose photo…',
    hint: 'Use a photo from your computer as the sample. It is only a preview and is not saved in the project.'
  },
  // tool rail
  toolDesign: {
    label: 'Design',
    hint: 'Add photo placeholders, text and shapes; set the background'
  },
  toolTemplates: { label: 'Templates', hint: 'Template gallery arrives in a later phase' },
  toolPhotos: { label: 'Photos', hint: 'Sample photo library arrives in a later phase' },
  toolAssets: { label: 'Assets', hint: 'Import and manage the images used in this project' },
  // top bar
  export: { label: 'Export', hint: 'Export arrives in a later phase' }
} as const satisfies Record<string, Tip>

export type TipId = keyof typeof TIPS

/**
 * Output Profiles (ADR-053): printer/media/finishing descriptions and the safe-area geometry and checks that read them.
 * Pure TypeScript (no Electron, React or DOM) and outside `TemplateProject`, so standalone Template Studio and the
 * future WalkOne Booth can share it.
 */
export * from './units'
export * from './profile'
export * from './builtIn'
export * from './safeArea'
export * from './safeAreaCheck'

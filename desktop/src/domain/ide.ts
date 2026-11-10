export type IDESession = { url: string; folder: string };
export interface IDEAPI {
  status(course: string): Promise<IDESession | null>;
  resume(course: string): Promise<IDESession | null>;
  open(createProject: boolean, course: string): Promise<IDESession | null>;
  importSnippet(
    source: string,
    filename: string,
    course: string,
  ): Promise<{ uri: string }>;
  bounds(
    value: { x: number; y: number; width: number; height: number } | null,
    course: string,
  ): Promise<void>;
  stop(): Promise<void>;
  newTerminal(): Promise<void>;
  revealExplorer(): Promise<void>;
  selectTheme?(): Promise<void>;
  openExtensions?(): Promise<void>;
  openWithMenu(position: { x: number; y: number }): Promise<void>;
}

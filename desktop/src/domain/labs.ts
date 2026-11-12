export type ProjectEntry = { path: string; kind: 'file' | 'directory' };
export interface LabStatus {
  available: boolean;
  running: boolean;
  message: string;
}
export interface LabsAPI {
  prepareTerminal(course: string): Promise<{ blockId: string; folder: string }>;
  configure(
    blockId: string,
    mode: 'local' | 'docker',
    createProject?: boolean,
  ): Promise<{ mode: 'local' | 'docker'; folder?: string } | null>;
  listFiles(blockId: string): Promise<ProjectEntry[]>;
  readProjectFile(blockId: string, path: string): Promise<string>;
  saveProjectFile(
    blockId: string,
    path: string,
    content: string,
  ): Promise<void>;
  createEntry(
    blockId: string,
    path: string,
    kind: 'file' | 'directory',
  ): Promise<void>;
  status(blockId: string): Promise<LabStatus>;
  start(blockId: string): Promise<void>;
  stop(blockId: string): Promise<void>;
  reset(blockId: string): Promise<void>;
  readFile(blockId: string): Promise<string>;
  saveFile(blockId: string, content: string): Promise<void>;
  openTerminal(blockId: string, id: string): Promise<void>;
  closeTerminal(blockId: string, id: string): Promise<void>;
  terminalInput(blockId: string, id: string, data: string): Promise<void>;
  resizeTerminal(
    blockId: string,
    id: string,
    cols: number,
    rows: number,
  ): Promise<void>;
  onTerminalData(
    listener: (event: { id: string; data: string }) => void,
  ): () => void;
}

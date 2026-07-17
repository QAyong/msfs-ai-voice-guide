import { app, BrowserWindow, ipcMain, screen, shell, WebContentsView } from 'electron';
import { join } from 'node:path';
import {
  dockToNearestSide,
  getExpandedBounds,
  keepTitleBarVisible,
  placeCompanionWindow,
  type DockSide,
} from './window-placement.js';

const assistantSize = { width: 320, height: 360 };
const collapsedSize = { width: 64, height: 72 };
const collapsedMenuSize = { width: 64, height: 174 };
const settingsSize = { width: 372, height: 454 };
const quitDialogSize = { width: 328, height: 224 };

type MenuDirection = 'up' | 'down';
type UtilityKind = 'settings' | 'quit';

let assistantWindow: BrowserWindow | null = null;
let sourceWindow: BrowserWindow | null = null;
let sourceView: WebContentsView | null = null;
let utilityWindow: BrowserWindow | null = null;
let assistantCollapsed = false;
let assistantMenuOpen = false;
let assistantMenuDirection: MenuDirection = 'down';
let assistantDockSide: DockSide = 'right';
let isPositioningAssistant = false;

const isDevelopment = Boolean(process.env.ELECTRON_RENDERER_URL);

const loadRenderer = async (window: BrowserWindow, hash: string) => {
  if (isDevelopment) {
    await window.loadURL(`${process.env.ELECTRON_RENDERER_URL}#${hash}`);
    return;
  }
  await window.loadFile(join(__dirname, '../renderer/index.html'), { hash });
};

const isAssistantSender = (sender: Electron.WebContents) =>
  Boolean(assistantWindow && sender === assistantWindow.webContents);

const isUtilitySender = (sender: Electron.WebContents) =>
  Boolean(utilityWindow && sender === utilityWindow.webContents);

const isSafeExternalUrl = (value: string) => {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && Boolean(url.hostname);
  } catch {
    return false;
  }
};

const setAssistantBounds = (bounds: Electron.Rectangle) => {
  if (!assistantWindow) return;
  const currentBounds = assistantWindow.getBounds();
  if (
    currentBounds.x === bounds.x &&
    currentBounds.y === bounds.y &&
    currentBounds.width === bounds.width &&
    currentBounds.height === bounds.height
  )
    return;
  isPositioningAssistant = true;
  assistantWindow.setBounds(bounds);
  setTimeout(() => {
    isPositioningAssistant = false;
  }, 0);
};

const setAssistantMenuOpen = (open: boolean): MenuDirection => {
  if (!assistantWindow || !assistantCollapsed || assistantMenuOpen === open) {
    return assistantMenuDirection;
  }

  const bounds = assistantWindow.getBounds();
  if (open) {
    const display = screen.getDisplayMatching(bounds);
    const extraHeight = collapsedMenuSize.height - collapsedSize.height;
    const spaceBelow = display.workArea.y + display.workArea.height - (bounds.y + bounds.height);
    const spaceAbove = bounds.y - display.workArea.y;
    assistantMenuDirection = spaceBelow >= extraHeight || spaceBelow >= spaceAbove ? 'down' : 'up';
    assistantWindow.setMinimumSize(collapsedMenuSize.width, collapsedMenuSize.height);
    setAssistantBounds({
      x: bounds.x,
      y: assistantMenuDirection === 'up' ? bounds.y - extraHeight : bounds.y,
      width: collapsedMenuSize.width,
      height: collapsedMenuSize.height,
    });
    assistantMenuOpen = true;
    return assistantMenuDirection;
  }

  const extraHeight = bounds.height - collapsedSize.height;
  assistantWindow.setMinimumSize(collapsedSize.width, collapsedSize.height);
  setAssistantBounds({
    x: bounds.x,
    y: assistantMenuDirection === 'up' ? bounds.y + extraHeight : bounds.y,
    width: collapsedSize.width,
    height: collapsedSize.height,
  });
  assistantMenuOpen = false;
  return assistantMenuDirection;
};

const positionUtilityWindow = (window: BrowserWindow) => {
  if (!assistantWindow) return;
  const assistantBounds = assistantWindow.getBounds();
  const display = screen.getDisplayMatching(assistantBounds);
  const utilityBounds = window.getBounds();
  const x = Math.round(
    display.workArea.x + Math.max(0, (display.workArea.width - utilityBounds.width) / 2),
  );
  const y = Math.round(
    display.workArea.y + Math.max(0, (display.workArea.height - utilityBounds.height) / 2),
  );
  window.setPosition(x, y);
};

const openUtilityWindow = async (kind: UtilityKind) => {
  if (!assistantWindow) return;
  if (assistantMenuOpen) setAssistantMenuOpen(false);

  if (utilityWindow) {
    if (utilityWindow.webContents.getURL().endsWith(`#${kind}`)) {
      utilityWindow.show();
      utilityWindow.focus();
      return;
    }
    utilityWindow.close();
  }

  const size = kind === 'settings' ? settingsSize : quitDialogSize;
  utilityWindow = new BrowserWindow({
    parent: assistantWindow,
    width: size.width,
    height: size.height,
    minWidth: size.width,
    minHeight: size.height,
    frame: false,
    transparent: true,
    resizable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    show: false,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: join(__dirname, '../preload/index.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  utilityWindow.setAlwaysOnTop(true, 'floating');
  utilityWindow.on('closed', () => {
    utilityWindow = null;
  });
  utilityWindow.once('ready-to-show', () => {
    if (!utilityWindow) return;
    positionUtilityWindow(utilityWindow);
    utilityWindow.show();
    utilityWindow.focus();
  });
  await loadRenderer(utilityWindow, kind);
};

const setSourcePosition = (x: number, y: number) => {
  if (!sourceWindow) return;
  const bounds = sourceWindow.getBounds();
  if (bounds.x === x && bounds.y === y) return;
  sourceWindow.setPosition(x, y);
};

const setSourceViewBounds = () => {
  if (!sourceWindow || !sourceView) return;
  const contentSize = sourceWindow.getContentSize();
  const width = contentSize[0] ?? 0;
  const height = contentSize[1] ?? 0;
  sourceView.setBounds({ x: 0, y: 48, width, height: Math.max(0, height - 48) });
};

const destroySourceView = () => {
  if (!sourceView) return;
  sourceView.webContents.close();
  sourceView = null;
};

const dockAssistantWindow = (useCursorDisplay = true) => {
  if (!assistantWindow) return;
  const bounds = assistantWindow.getBounds();
  const display = useCursorDisplay
    ? screen.getDisplayNearestPoint(screen.getCursorScreenPoint())
    : screen.getDisplayMatching(bounds);
  const docked = dockToNearestSide(bounds, display.workArea);
  assistantDockSide = docked.side;
  setAssistantBounds({ ...bounds, x: docked.x, y: docked.y });
};

const constrainExpandedAssistant = (useCursorDisplay = true) => {
  if (!assistantWindow) return;
  const bounds = assistantWindow.getBounds();
  const display = useCursorDisplay
    ? screen.getDisplayNearestPoint(screen.getCursorScreenPoint())
    : screen.getDisplayMatching(bounds);
  setAssistantBounds(keepTitleBarVisible(bounds, display.workArea));
};

const positionSourceNextToAssistant = () => {
  if (!assistantWindow || !sourceWindow) return;
  const assistantBounds = assistantWindow.getBounds();
  const sourceBounds = sourceWindow.getBounds();
  const display = screen.getDisplayMatching(assistantBounds);
  const placement = placeCompanionWindow(assistantBounds, sourceBounds, display.workArea);
  setSourcePosition(placement.x, placement.y);
};

const handleAssistantMove = () => {
  if (!assistantWindow || isPositioningAssistant) return;
  positionSourceNextToAssistant();
};

const handleAssistantMoved = () => {
  if (!assistantWindow || isPositioningAssistant) return;
  if (assistantCollapsed) dockAssistantWindow();
  else constrainExpandedAssistant();
  positionSourceNextToAssistant();
};

const handleDisplayChange = () => {
  if (assistantWindow) {
    if (assistantCollapsed) dockAssistantWindow(false);
    else constrainExpandedAssistant(false);
  }
  if (!sourceWindow) return;
  positionSourceNextToAssistant();
};

const showRemoteSource = async (url: string) => {
  if (!sourceWindow || !isSafeExternalUrl(url)) return;
  destroySourceView();
  sourceView = new WebContentsView({
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  sourceWindow.contentView.addChildView(sourceView);
  sourceView.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  sourceView.webContents.session.setPermissionRequestHandler(
    (_webContents, _permission, callback) => callback(false),
  );
  sourceView.webContents.on('will-navigate', (event, targetUrl) => {
    if (!isSafeExternalUrl(targetUrl)) event.preventDefault();
  });
  sourceView.webContents.on('will-redirect', (event, targetUrl) => {
    if (!isSafeExternalUrl(targetUrl)) event.preventDefault();
  });
  setSourceViewBounds();
  await sourceView.webContents.loadURL(url);
};

const createAssistantWindow = async () => {
  assistantWindow = new BrowserWindow({
    width: assistantSize.width,
    height: assistantSize.height,
    minWidth: 240,
    minHeight: 158,
    frame: false,
    transparent: true,
    resizable: true,
    alwaysOnTop: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  assistantWindow.setAlwaysOnTop(true, 'floating');
  assistantWindow.on('closed', () => {
    assistantWindow = null;
    sourceWindow?.close();
    utilityWindow?.close();
  });
  assistantWindow.on('move', handleAssistantMove);
  assistantWindow.on('moved', handleAssistantMoved);
  assistantWindow.on('resize', positionSourceNextToAssistant);
  await loadRenderer(assistantWindow, 'assistant');
};

const createSourceWindow = async () => {
  if (!assistantWindow) return;
  sourceWindow = new BrowserWindow({
    parent: assistantWindow,
    width: 440,
    height: 600,
    minWidth: 280,
    minHeight: 240,
    frame: false,
    resizable: true,
    alwaysOnTop: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  sourceWindow.setAlwaysOnTop(true, 'floating');
  sourceWindow.on('resize', setSourceViewBounds);
  sourceWindow.on('moved', positionSourceNextToAssistant);
  sourceWindow.on('closed', () => {
    destroySourceView();
    sourceWindow = null;
  });
  await loadRenderer(sourceWindow, 'source');
};

ipcMain.handle('assistant:set-collapsed', (event, collapsed: boolean) => {
  if (!assistantWindow || !isAssistantSender(event.sender)) return;
  const currentDisplay = screen.getDisplayMatching(assistantWindow.getBounds());
  if (assistantMenuOpen) setAssistantMenuOpen(false);
  assistantCollapsed = collapsed;
  if (collapsed) {
    sourceWindow?.close();
    assistantWindow.setMinimumSize(collapsedSize.width, collapsedSize.height);
    assistantWindow.setSize(collapsedSize.width, collapsedSize.height);
    dockAssistantWindow(false);
    return;
  }
  assistantWindow.setMinimumSize(240, 158);
  setAssistantBounds(
    getExpandedBounds(
      currentDisplay.workArea,
      assistantDockSide,
      assistantWindow.getBounds().y,
      assistantSize,
    ),
  );
});

ipcMain.handle('assistant:set-menu-open', (event, open: boolean) => {
  if (!isAssistantSender(event.sender)) return assistantMenuDirection;
  return setAssistantMenuOpen(open);
});

ipcMain.handle('settings:open', async (event) => {
  if (!isAssistantSender(event.sender)) return;
  await openUtilityWindow('settings');
});

ipcMain.handle('app:open-quit-dialog', async (event) => {
  if (!isAssistantSender(event.sender)) return;
  await openUtilityWindow('quit');
});

ipcMain.handle('utility:close', (event) => {
  if (isUtilitySender(event.sender)) utilityWindow?.close();
});

ipcMain.handle('app:quit-confirmed', (event) => {
  if (isUtilitySender(event.sender)) app.quit();
});

ipcMain.handle('assistant:set-always-on-top', (event, enabled: boolean) => {
  if (!isAssistantSender(event.sender) && !isUtilitySender(event.sender)) return;
  assistantWindow?.setAlwaysOnTop(enabled, enabled ? 'floating' : 'normal');
});

ipcMain.handle('source:open', async (event, url: string) => {
  if (!assistantWindow || !isAssistantSender(event.sender) || !isSafeExternalUrl(url)) return false;
  if (!sourceWindow) await createSourceWindow();
  if (!sourceWindow) return false;
  positionSourceNextToAssistant();
  sourceWindow.show();
  await showRemoteSource(url);
  return true;
});

ipcMain.handle('source:close', (event) => {
  if (event.sender === sourceWindow?.webContents) sourceWindow.close();
});

ipcMain.handle('external:open', (event, url: string) => {
  const trustedSender =
    event.sender === assistantWindow?.webContents || event.sender === sourceWindow?.webContents;
  return trustedSender && isSafeExternalUrl(url) ? shell.openExternal(url) : undefined;
});

app.whenReady().then(async () => {
  await createAssistantWindow();
  screen.on('display-added', handleDisplayChange);
  screen.on('display-removed', handleDisplayChange);
  screen.on('display-metrics-changed', handleDisplayChange);
});
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
app.on('activate', () => {
  if (!assistantWindow) void createAssistantWindow();
});

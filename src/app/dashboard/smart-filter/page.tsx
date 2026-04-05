'use client';

import { useState, useCallback, useRef } from 'react';
import {
  Box,
  Typography,
  Button,
  Paper,
  Stack,
  Stepper,
  Step,
  StepLabel,
  TextField,
  LinearProgress,
  Alert,
  Chip,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Divider,
} from '@mui/material';
import {
  FolderOpen as FolderIcon,
  CheckCircle as CheckIcon,
  Error as ErrorIcon,
  ContentCopy as CopyIcon,
  InsertDriveFile as FileIcon,
  CloudUpload as UploadIcon,
  PlayArrow as PlayIcon,
  NavigateNext as NextIcon,
  NavigateBefore as PrevIcon,
} from '@mui/icons-material';

const IMAGE_EXTENSIONS = [
  'jpg', 'jpeg', 'png', 'webp', 'tiff', 'cr2', 'nef', 'arw', 'raw', 'dng', 'heic',
];

const STEPS = [
  'Chọn thư mục nguồn',
  'Chọn thư mục đích',
  'Nhập danh sách tên file',
  'Chạy bộ lọc',
  'Kết quả',
];

interface FileEntry {
  name: string;
  handle: FileSystemFileHandle;
  path: string;
}

export default function SmartFilterPage() {
  const [activeStep, setActiveStep] = useState(0);
  const [isSupported, setIsSupported] = useState(
    typeof window !== 'undefined' && 'showDirectoryPicker' in window
  );

  const [sourceDir, setSourceDir] = useState<FileSystemDirectoryHandle | null>(null);
  const [sourceDirName, setSourceDirName] = useState('');
  const [sourceFiles, setSourceFiles] = useState<FileEntry[]>([]);
  const [scanningSource, setScanningSource] = useState(false);

  const [destDir, setDestDir] = useState<FileSystemDirectoryHandle | null>(null);
  const [destDirName, setDestDirName] = useState('');

  const [filenameInput, setFilenameInput] = useState('');
  const [targetFilenames, setTargetFilenames] = useState<string[]>([]);

  const [filtering, setFiltering] = useState(false);
  const [filterProgress, setFilterProgress] = useState(0);

  const [foundFiles, setFoundFiles] = useState<string[]>([]);
  const [missingFiles, setMissingFiles] = useState<string[]>([]);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Recursive scan for images
  const scanDirectory = useCallback(
    async (dirHandle: FileSystemDirectoryHandle, basePath = ''): Promise<FileEntry[]> => {
      const entries: FileEntry[] = [];
      for await (const entry of (dirHandle as any).values()) {
        const currentPath = basePath ? `${basePath}/${entry.name}` : entry.name;
        if (entry.kind === 'file') {
          const ext = entry.name.split('.').pop()?.toLowerCase() || '';
          if (IMAGE_EXTENSIONS.includes(ext)) {
            entries.push({
              name: entry.name,
              handle: entry as FileSystemFileHandle,
              path: currentPath,
            });
          }
        } else if (entry.kind === 'directory') {
          const subEntries = await scanDirectory(entry as FileSystemDirectoryHandle, currentPath);
          entries.push(...subEntries);
        }
      }
      return entries;
    },
    []
  );

  // Step 1: Choose source folder
  const handleChooseSource = async () => {
    try {
      const dirHandle = await (window as any).showDirectoryPicker({ mode: 'read' });
      setSourceDir(dirHandle);
      setSourceDirName(dirHandle.name);
      setScanningSource(true);

      const files = await scanDirectory(dirHandle);
      setSourceFiles(files);
      setScanningSource(false);
    } catch (err) {
      // User cancelled
      setScanningSource(false);
    }
  };

  // Step 2: Choose destination folder
  const handleChooseDest = async () => {
    try {
      const dirHandle = await (window as any).showDirectoryPicker({ mode: 'readwrite' });
      setDestDir(dirHandle);
      setDestDirName(dirHandle.name);
    } catch {
      // User cancelled
    }
  };

  // Step 3: Parse filename list
  const parseFilenames = () => {
    const lines = filenameInput
      .split(/[\n,;]+/)
      .map((l) => l.trim())
      .filter(Boolean);
    setTargetFilenames(lines);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      const text = evt.target?.result as string;
      setFilenameInput(text);
    };
    reader.readAsText(file);
  };

  // Step 4: Run filter
  const runFilter = async () => {
    if (!destDir || targetFilenames.length === 0) return;
    setFiltering(true);
    setFilterProgress(0);

    const found: string[] = [];
    const missing: string[] = [];

    for (let i = 0; i < targetFilenames.length; i++) {
      const target = targetFilenames[i];
      const targetLower = target.toLowerCase();

      // Find matching file (case-insensitive, with or without extension)
      const match = sourceFiles.find((f) => {
        const fName = f.name.toLowerCase();
        const fBase = fName.substring(0, fName.lastIndexOf('.')) || fName;
        return fName === targetLower || fBase === targetLower;
      });

      if (match) {
        try {
          const sourceFile = await match.handle.getFile();
          const destFile = await destDir.getFileHandle(match.name, { create: true });
          const writable = await destFile.createWritable();
          await writable.write(await sourceFile.arrayBuffer());
          await writable.close();
          found.push(match.name);
        } catch {
          missing.push(target);
        }
      } else {
        missing.push(target);
      }

      setFilterProgress(Math.round(((i + 1) / targetFilenames.length) * 100));
    }

    setFoundFiles(found);
    setMissingFiles(missing);
    setFiltering(false);
    setActiveStep(4);
  };

  if (!isSupported) {
    return (
      <Box sx={{ p: 3 }}>
        <Typography variant="h4" fontWeight={700} mb={3}>
          Bộ lọc thông minh
        </Typography>
        <Alert severity="warning">
          Trình duyệt của bạn không hỗ trợ File System Access API. Vui lòng sử dụng Google Chrome
          hoặc Microsoft Edge phiên bản mới nhất.
        </Alert>
      </Box>
    );
  }

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h4" fontWeight={700} mb={3}>
        Bộ lọc thông minh
      </Typography>
      <Typography variant="body2" color="text.secondary" mb={4}>
        Lọc và sao chép ảnh từ thư mục nguồn sang thư mục đích dựa trên danh sách tên file. Hoạt
        động 100% trên trình duyệt, không tải lên máy chủ.
      </Typography>

      <Stepper activeStep={activeStep} sx={{ mb: 4 }}>
        {STEPS.map((label) => (
          <Step key={label}>
            <StepLabel>{label}</StepLabel>
          </Step>
        ))}
      </Stepper>

      {/* Step 1: Source Folder */}
      {activeStep === 0 && (
        <Paper sx={{ p: 4 }}>
          <Typography variant="h6" mb={2}>
            Bước 1: Chọn thư mục nguồn
          </Typography>
          <Typography variant="body2" color="text.secondary" mb={3}>
            Chọn thư mục chứa tất cả ảnh gốc. Hệ thống sẽ quét đệ quy tất cả thư mục con.
          </Typography>

          <Button
            variant="contained"
            startIcon={<FolderIcon />}
            onClick={handleChooseSource}
            disabled={scanningSource}
          >
            {scanningSource ? 'Đang quét...' : 'Chọn thư mục'}
          </Button>

          {scanningSource && <LinearProgress sx={{ mt: 2 }} />}

          {sourceDirName && (
            <Alert severity="success" sx={{ mt: 2 }}>
              Thư mục: <strong>{sourceDirName}</strong> - Tìm thấy{' '}
              <strong>{sourceFiles.length}</strong> ảnh
            </Alert>
          )}

          <Stack direction="row" justifyContent="flex-end" mt={3}>
            <Button
              variant="contained"
              endIcon={<NextIcon />}
              disabled={sourceFiles.length === 0}
              onClick={() => setActiveStep(1)}
            >
              Tiếp theo
            </Button>
          </Stack>
        </Paper>
      )}

      {/* Step 2: Destination Folder */}
      {activeStep === 1 && (
        <Paper sx={{ p: 4 }}>
          <Typography variant="h6" mb={2}>
            Bước 2: Chọn thư mục đích
          </Typography>
          <Typography variant="body2" color="text.secondary" mb={3}>
            Chọn thư mục nơi các ảnh được lọc sẽ được sao chép vào.
          </Typography>

          <Button variant="contained" startIcon={<FolderIcon />} onClick={handleChooseDest}>
            Chọn thư mục
          </Button>

          {destDirName && (
            <Alert severity="success" sx={{ mt: 2 }}>
              Thư mục đích: <strong>{destDirName}</strong>
            </Alert>
          )}

          <Stack direction="row" justifyContent="space-between" mt={3}>
            <Button startIcon={<PrevIcon />} onClick={() => setActiveStep(0)}>
              Quay lại
            </Button>
            <Button
              variant="contained"
              endIcon={<NextIcon />}
              disabled={!destDir}
              onClick={() => setActiveStep(2)}
            >
              Tiếp theo
            </Button>
          </Stack>
        </Paper>
      )}

      {/* Step 3: Filename List */}
      {activeStep === 2 && (
        <Paper sx={{ p: 4 }}>
          <Typography variant="h6" mb={2}>
            Bước 3: Nhập danh sách tên file
          </Typography>
          <Typography variant="body2" color="text.secondary" mb={3}>
            Nhập tên file (mỗi file một dòng) hoặc tải lên file .txt chứa danh sách.
          </Typography>

          <Stack spacing={2}>
            <TextField
              multiline
              rows={10}
              value={filenameInput}
              onChange={(e) => setFilenameInput(e.target.value)}
              placeholder={`Ví dụ:\nIMG_001.jpg\nIMG_002.jpg\nDSC_1234`}
              fullWidth
            />

            <Stack direction="row" spacing={2}>
              <Button
                variant="outlined"
                startIcon={<UploadIcon />}
                onClick={() => fileInputRef.current?.click()}
              >
                Tải file .txt
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".txt"
                style={{ display: 'none' }}
                onChange={handleFileUpload}
              />
              <Button variant="outlined" onClick={parseFilenames} disabled={!filenameInput.trim()}>
                Xác nhận danh sách
              </Button>
            </Stack>

            {targetFilenames.length > 0 && (
              <Alert severity="info">
                Đã nhận <strong>{targetFilenames.length}</strong> tên file
              </Alert>
            )}
          </Stack>

          <Stack direction="row" justifyContent="space-between" mt={3}>
            <Button startIcon={<PrevIcon />} onClick={() => setActiveStep(1)}>
              Quay lại
            </Button>
            <Button
              variant="contained"
              endIcon={<NextIcon />}
              disabled={targetFilenames.length === 0}
              onClick={() => setActiveStep(3)}
            >
              Tiếp theo
            </Button>
          </Stack>
        </Paper>
      )}

      {/* Step 4: Run Filter */}
      {activeStep === 3 && (
        <Paper sx={{ p: 4 }}>
          <Typography variant="h6" mb={2}>
            Bước 4: Chạy bộ lọc
          </Typography>

          <Stack spacing={2} mb={3}>
            <Typography variant="body2">
              Thư mục nguồn: <strong>{sourceDirName}</strong> ({sourceFiles.length} ảnh)
            </Typography>
            <Typography variant="body2">
              Thư mục đích: <strong>{destDirName}</strong>
            </Typography>
            <Typography variant="body2">
              Danh sách cần lọc: <strong>{targetFilenames.length}</strong> file
            </Typography>
          </Stack>

          {filtering && (
            <Box mb={3}>
              <LinearProgress variant="determinate" value={filterProgress} sx={{ mb: 1 }} />
              <Typography variant="body2" color="text.secondary" textAlign="center">
                Đang xử lý... {filterProgress}%
              </Typography>
            </Box>
          )}

          <Button
            variant="contained"
            size="large"
            startIcon={<PlayIcon />}
            onClick={runFilter}
            disabled={filtering}
          >
            {filtering ? 'Đang xử lý...' : 'Bắt đầu lọc'}
          </Button>

          <Stack direction="row" justifyContent="flex-start" mt={3}>
            <Button startIcon={<PrevIcon />} onClick={() => setActiveStep(2)} disabled={filtering}>
              Quay lại
            </Button>
          </Stack>
        </Paper>
      )}

      {/* Step 5: Results */}
      {activeStep === 4 && (
        <Paper sx={{ p: 4 }}>
          <Typography variant="h6" mb={3}>
            Bước 5: Kết quả
          </Typography>

          <Stack direction="row" spacing={3} mb={3}>
            <Chip
              icon={<CheckIcon />}
              label={`Tìm thấy: ${foundFiles.length}`}
              color="success"
              variant="outlined"
              sx={{ fontSize: 16, py: 2, px: 1 }}
            />
            <Chip
              icon={<ErrorIcon />}
              label={`Không tìm thấy: ${missingFiles.length}`}
              color="error"
              variant="outlined"
              sx={{ fontSize: 16, py: 2, px: 1 }}
            />
          </Stack>

          {missingFiles.length > 0 && (
            <>
              <Divider sx={{ my: 2 }} />
              <Typography variant="subtitle1" fontWeight={600} mb={1}>
                Danh sách file không tìm thấy:
              </Typography>
              <List dense>
                {missingFiles.map((f, i) => (
                  <ListItem key={i}>
                    <ListItemIcon sx={{ minWidth: 36 }}>
                      <ErrorIcon color="error" fontSize="small" />
                    </ListItemIcon>
                    <ListItemText primary={f} />
                  </ListItem>
                ))}
              </List>
              <Button
                startIcon={<CopyIcon />}
                onClick={() => {
                  navigator.clipboard.writeText(missingFiles.join('\n'));
                }}
                variant="outlined"
                size="small"
                sx={{ mt: 1 }}
              >
                Sao chép danh sách thiếu
              </Button>
            </>
          )}

          {foundFiles.length > 0 && (
            <>
              <Divider sx={{ my: 2 }} />
              <Typography variant="subtitle1" fontWeight={600} mb={1}>
                Danh sách file đã sao chép:
              </Typography>
              <List dense sx={{ maxHeight: 300, overflow: 'auto' }}>
                {foundFiles.map((f, i) => (
                  <ListItem key={i}>
                    <ListItemIcon sx={{ minWidth: 36 }}>
                      <CheckIcon color="success" fontSize="small" />
                    </ListItemIcon>
                    <ListItemText primary={f} />
                  </ListItem>
                ))}
              </List>
            </>
          )}

          <Stack direction="row" justifyContent="space-between" mt={3}>
            <Button onClick={() => setActiveStep(0)} variant="outlined">
              Bắt đầu lại
            </Button>
          </Stack>
        </Paper>
      )}
    </Box>
  );
}

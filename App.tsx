import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { Header } from './components/Header';
import { Instructions } from './components/Instructions';
import { Icon } from './components/Icon';
import { ErrorBubble } from './components/ErrorBubble';
import { LivePreviewImage } from './components/LivePreviewImage';
import { 
  TextField, 
  ImageField, 
  PhotoFiles, 
  GeneratedCredential, 
  ValidationErrors, 
  ParsedCsv,
  ImageDimensions,
  MousePosition
} from './types';

// Declare JSZip and XLSX for use from CDN
declare const JSZip: any;
declare const XLSX: any;

const App: React.FC = () => {
  // --- STATE INITIALIZATION WITH LOCAL STORAGE ---
  const loadInitialState = () => {
    try {
      const savedState = localStorage.getItem('credentialGeneratorConfig');
      if (savedState) {
        return JSON.parse(savedState);
      }
    } catch (error) {
      console.error("Error al cargar el estado desde localStorage:", error);
    }
    // Return default state if nothing is saved or if there's an error
    return {
      textFields: [
        { id: 1, content: '{{nombre}}\n{{apellidos}}', x: 150, y: 100, fontSize: 32, color: '#FFFFFF', isBold: true, isItalic: false },
        { id: 2, content: 'ID: {{id}} - {{puesto}}', x: 150, y: 180, fontSize: 20, color: '#DDDDDD', isBold: false, isItalic: false },
      ],
      imageFields: [
        { id: 1, x: 30, y: 80, width: 100, height: 100, linkColumn: 'id', frame: { color: '#ffffff', thickness: 4 } },
      ],
      filenamePattern: 'credencial-{{id}}.png',
    };
  };

  const [csvData, setCsvData] = useState<string>('');
  const [excelFilename, setExcelFilename] = useState<string>('');
  const [templateImage, setTemplateImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageDimensions, setImageDimensions] = useState<ImageDimensions | null>(null);
  const [textFields, setTextFields] = useState<TextField[]>(loadInitialState().textFields);
  const [imageFields, setImageFields] = useState<ImageField[]>(loadInitialState().imageFields);
  const [photoFiles, setPhotoFiles] = useState<PhotoFiles>({});
  const [photoUploadStatus, setPhotoUploadStatus] = useState<string>('');
  const [filenamePattern, setFilenamePattern] = useState<string>(loadInitialState().filenamePattern);
  const [generatedCredentials, setGeneratedCredentials] = useState<GeneratedCredential[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [showGrid, setShowGrid] = useState<boolean>(false);
  const [mousePosition, setMousePosition] = useState<MousePosition | null>(null);
  const [isZoomActive, setIsZoomActive] = useState<boolean>(false);
  const [previewRowIndex, setPreviewRowIndex] = useState<number>(0);
  const [validationErrors, setValidationErrors] = useState<ValidationErrors>({});
  
  const imageRef = useRef<HTMLImageElement>(null);
  const previewImageRef = useRef<HTMLImageElement>(null);
  const restoreInputRef = useRef<HTMLInputElement>(null);

  // --- EFFECT TO SAVE STATE TO LOCAL STORAGE ---
  useEffect(() => {
    try {
      const stateToSave = {
        textFields,
        imageFields,
        filenamePattern,
      };
      localStorage.setItem('credentialGeneratorConfig', JSON.stringify(stateToSave));
    } catch (error) {
      console.error("Error al guardar el estado en localStorage:", error);
    }
  }, [textFields, imageFields, filenamePattern]);


  const parseCsv = (csv: string): ParsedCsv => {
    const lines = csv.trim().split(/\r\n?|\n/).filter(line => line.trim() !== '');
    if (lines.length === 0) return { headers: [], rows: [] };

    const cleanCell = (cell: string) => {
        let value = cell.trim();
        if (value.startsWith('"') && value.endsWith('"')) {
            value = value.substring(1, value.length - 1);
        }
        return value.trim();
    };
    
    // Normalize headers to lowercase for case-insensitive matching
    const headers = lines[0].replace(/^\uFEFF/, '').split(',').map(h => cleanCell(h).toLowerCase());
    const rows = lines.slice(1).map(line => line.split(',').map(cleanCell));
    return { headers, rows };
  };

  const replacePlaceholders = (template: string, headers: string[], row: string[] | undefined): string => {
    if (!row) return template;
    let result = template;
    headers.forEach((header, index) => {
      // The header is already lowercased from parseCsv
      const escapedHeader = header.replace(/[-/\^$*+?.()|[\]{}]/g, '\\$&');
      // Use 'gi' flag for global and case-insensitive replacement
      const regex = new RegExp(`{{\\s*${escapedHeader}\\s*}}`, 'gi');
      result = result.replace(regex, row[index] || '');
    });
    return result;
  };

  const parsedCsv = useMemo<ParsedCsv>(() => {
    try {
      if (!csvData.trim()) return { headers: [], rows: [] };
      const data = parseCsv(csvData);
      if (previewRowIndex >= data.rows.length) {
        setPreviewRowIndex(Math.max(0, data.rows.length - 1));
      }
      return data;
    } catch (e) {
      return { headers: [], rows: [] };
    }
  }, [csvData, previewRowIndex]);
  
  useEffect(() => {
    const errors: ValidationErrors = {};
    if (!templateImage) errors.templateImage = { message: "No se ha cargado una plantilla de imagen.", suggestion: "Sube un archivo JPG o PNG para usarlo como fondo." };
    const { headers, rows } = parsedCsv;
    if (!csvData.trim()) errors.csvData = { message: "No se han cargado datos.", suggestion: "Sube un archivo Excel (.xlsx, .xls) con los datos para las credenciales." };
    else {
      if (headers.length === 0) errors.csvData = { message: "El archivo no tiene una fila de encabezado válida.", suggestion: "Asegúrate de que la primera fila de tu hoja de Excel contenga los nombres de las columnas." };
      else {
        const inconsistentRows = rows.map((row, i) => ({ row, i })).filter(item => item.row.length !== headers.length);
        if (inconsistentRows.length > 0) errors.csvData = { message: `Las filas ${inconsistentRows.map(item => item.i + 2).join(', ')} tienen un número de columnas diferente.`, suggestion: "Revisa estas filas en tu archivo para asegurarte de que tengan el mismo número de columnas que el encabezado." };
        
        const getPlaceholders = (str: string) => (str.match(/{{\s*([^}\s]+)\s*}}/g) || []).map(p => p.replace(/{{\s*|\s*}}/g, ''));
        
        const checkPlaceholders = (text: string, keyPrefix: string) => {
          for (const placeholder of getPlaceholders(text)) {
            // Check against lowercased headers
            if (!headers.includes(placeholder.toLowerCase())) {
              errors[keyPrefix] = { 
                message: `El marcador '{{${placeholder}}}' no existe en los encabezados.`, 
                suggestion: `Encabezados disponibles: ${headers.join(', ')}. Revisa que los nombres coincidan (no distingue mayúsculas/minúsculas).`
              };
            }
          }
        };
        textFields.forEach(f => checkPlaceholders(f.content, `textField_${f.id}_content`));
        checkPlaceholders(filenamePattern, 'filenamePattern');
      }
    }
    if (imageFields.length > 0 && Object.keys(photoFiles).length === 0) errors.photoUpload = { message: "Hay campos de imagen definidos, pero no se han cargado fotos.", suggestion: "Selecciona los archivos de imagen correspondientes a los identificadores de tu archivo de datos." };
    if (imageFields.length > 0 && headers.length > 0) imageFields.forEach(field => {
      if (!field.linkColumn) errors[`imageField_${field.id}_linkColumn`] = { message: "No se ha vinculado una columna.", suggestion: "Selecciona la columna que contiene los identificadores de las fotos." };
      // Check against lowercased headers
      else if (!headers.includes(field.linkColumn.toLowerCase())) {
        errors[`imageField_${field.id}_linkColumn`] = { 
            message: `La columna '${field.linkColumn}' no existe en los encabezados.`, 
            suggestion: `Encabezados disponibles: ${headers.join(', ')}. Revisa que la columna seleccionada coincida con uno de ellos.`
        };
      }
    });
    setValidationErrors(errors);
  }, [csvData, templateImage, textFields, imageFields, photoFiles, filenamePattern, parsedCsv]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => { if (e.key === 'Alt') { e.preventDefault(); setIsZoomActive(true); }};
    const handleKeyUp = (e: KeyboardEvent) => { if (e.key === 'Alt') setIsZoomActive(false); };
    const handleBlur = () => setIsZoomActive(false);
    window.addEventListener('keydown', handleKeyDown); window.addEventListener('keyup', handleKeyUp); window.addEventListener('blur', handleBlur);
    return () => { window.removeEventListener('keydown', handleKeyDown); window.removeEventListener('keyup', handleKeyUp); window.removeEventListener('blur', handleBlur); };
  }, []);

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) { 
      setTemplateImage(file); 
      const reader = new FileReader(); 
      reader.onloadend = () => setImagePreview(reader.result as string); 
      reader.readAsDataURL(file); 
    }
  };

  const handleExcelUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setExcelFilename(file.name);
    const reader = new FileReader();
    reader.onload = (event) => {
        try {
            const data = event.target?.result;
            const workbook = XLSX.read(data, { type: 'array' });
            const sheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[sheetName];
            const csv = XLSX.utils.sheet_to_csv(worksheet);
            setCsvData(csv);
            setError(null);
        } catch (err: any) {
            setError(`Error al procesar el archivo Excel: ${err.message}`);
            setCsvData('');
            setExcelFilename('');
        }
    };
    reader.onerror = () => {
        setError("No se pudo leer el archivo Excel.");
        setCsvData('');
        setExcelFilename('');
    };
    reader.readAsArrayBuffer(file);
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files; if (!files || files.length === 0) return;
    setPhotoUploadStatus(`Cargando ${files.length} imágenes...`);
    try {
      const photoData: PhotoFiles = {};
      // FIX: Explicitly type `file` as `File` to resolve properties like `type` and `name` being inaccessible.
      await Promise.all(Array.from(files).map((file: File) => new Promise<void>((resolve, reject) => {
        if (!file.type.startsWith('image/')) return resolve();
        const key = (file.name.substring(0, file.name.lastIndexOf('.')) || file.name).trim().toLowerCase();
        if (key) { 
          const reader = new FileReader(); 
          reader.onloadend = () => { photoData[key] = reader.result as string; resolve(); }; 
          reader.onerror = reject; 
          reader.readAsDataURL(file); 
        } else resolve();
      })));
      setPhotoFiles(photoData); setPhotoUploadStatus(`${Object.keys(photoData).length} imágenes cargadas correctamente.`);
    } catch (err) { setPhotoUploadStatus('Error al leer los archivos de imagen.'); console.error(err); }
  };

  const handleMouseMoveOnImage = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!imageRef.current || !imageDimensions) return setMousePosition(null);
    const rect = imageRef.current.getBoundingClientRect();
    const offsetX = e.clientX - rect.left; const offsetY = e.clientY - rect.top;
    const scaleX = imageDimensions.width / imageRef.current.clientWidth; const scaleY = imageDimensions.height / imageRef.current.clientHeight;
    setMousePosition({ offsetX, offsetY, trueX: Math.round(offsetX * scaleX), trueY: Math.round(offsetY * scaleY) });
  };
  const handleMouseLeaveImage = () => setMousePosition(null);

  const handleAddField = () => setTextFields([...textFields, { id: Date.now(), content: 'Nuevo Campo', x: 50, y: 200, fontSize: 16, color: '#FFFFFF', isBold: false, isItalic: false }]);
  const handleAddImageField = () => setImageFields([...imageFields, { id: Date.now(), x: 50, y: 50, width: 100, height: 100, linkColumn: parsedCsv.headers[0] || '', frame: { color: '#FFFFFF', thickness: 0 } }]);
  const handleFieldChange = (id: number, field: keyof TextField, value: any) => setTextFields(textFields.map(f => f.id === id ? { ...f, [field]: value } : f));
  const handleImageFieldChange = (id: number, field: keyof ImageField, value: any) => setImageFields(imageFields.map(f => f.id === id ? { ...f, [field]: value } : f));
  const handleRemoveField = (id: number) => setTextFields(textFields.filter(f => f.id !== id));
  const handleRemoveImageField = (id: number) => setImageFields(imageFields.filter(f => f.id !== id));

  const handleGenerate = useCallback(async () => {
    if (Object.keys(validationErrors).length > 0) { setError(`No se puede generar. Por favor, soluciona los problemas detectados.`); return; }
    setIsLoading(true); setError(null); setGeneratedCredentials([]);
    try {
      if (!imagePreview) throw new Error('La imagen de plantilla no está cargada.');
      const { headers, rows } = parsedCsv; // headers are already lowercase
      const image = new Image(); image.src = imagePreview; await new Promise((res, rej) => { image.onload = res; image.onerror = rej; });
      const generatedImages = await Promise.all(rows.map(async (row) => {
        const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height; const ctx = canvas.getContext('2d'); if (!ctx) throw new Error('No se pudo obtener el contexto del canvas.');
        ctx.drawImage(image, 0, 0);
        for (const field of imageFields) {
          const linkColumnLower = (field.linkColumn || '').toLowerCase();
          const colIndex = headers.findIndex(h => h.toLowerCase() === linkColumnLower);
          if (colIndex === -1) continue;

          const photoBaseName = (row[colIndex] || '').trim().toLowerCase(); const photoSrc = photoFiles[photoBaseName];
          if (photoSrc) {
            const photoImg = new Image(); photoImg.src = photoSrc; await new Promise<void>(res => { photoImg.onload = () => res(); });
            if (field.frame && field.frame.thickness > 0) {
              ctx.fillStyle = field.frame.color || '#000000';
              ctx.fillRect(field.x, field.y, field.width, field.height);
            }
            const thickness = field.frame?.thickness || 0;
            const destX = field.x + thickness; const destY = field.y + thickness; const destW = field.width - (2 * thickness); const destH = field.height - (2 * thickness);
            if (destW > 0 && destH > 0) {
              const srcW = photoImg.naturalWidth; const srcH = photoImg.naturalHeight; const srcAR = srcW / srcH; const destAR = destW / destH;
              let sWidth: number, sHeight: number, sx: number, sy: number;
              if (srcAR > destAR) { sHeight = srcH; sWidth = srcH * destAR; sx = (srcW - sWidth) / 2; sy = 0; } 
              else { sWidth = srcW; sHeight = srcW / destAR; sy = (srcH - sHeight) / 2; sx = 0; }
              ctx.drawImage(photoImg, sx, sy, sWidth, sHeight, destX, destY, destW, destH);
            }
          }
        }
        ctx.textBaseline = 'top';
        textFields.forEach(field => {
          const fontStyle = field.isItalic ? 'italic' : 'normal'; const fontWeight = field.isBold ? 'bold' : 'normal'; const fontSize = parseInt(String(field.fontSize)) || 0;
          ctx.font = `${fontStyle} ${fontWeight} ${fontSize}px sans-serif`; ctx.fillStyle = field.color;
          const text = replacePlaceholders(field.content, headers, row); const lines = text.split('\n'); const lineHeight = fontSize * 1.2;
          lines.forEach((line, index) => ctx.fillText(line, parseInt(String(field.x)) || 0, (parseInt(String(field.y)) || 0) + (index * lineHeight)));
        });
        const dataUrl = canvas.toDataURL('image/png'); const filename = replacePlaceholders(filenamePattern, headers, row) || `credencial-${rows.indexOf(row) + 1}.png`;
        return { dataUrl, filename };
      }));
      setGeneratedCredentials(generatedImages);
    } catch (e: any) { setError(e.message || 'Ocurrió un error desconocido durante la generación.'); } finally { setIsLoading(false); }
  }, [csvData, textFields, imageFields, photoFiles, imagePreview, filenamePattern, validationErrors, parsedCsv]);

  const handleDownloadAll = async () => {
    if (generatedCredentials.length === 0) return;
    const zip = new JSZip(); generatedCredentials.forEach(c => zip.file(c.filename, c.dataUrl.split(',')[1], { base64: true }));
    const blob = await zip.generateAsync({ type: 'blob' }); const url = URL.createObjectURL(blob); const link = document.createElement('a');
    link.href = url; link.download = 'credenciales-generadas.zip'; document.body.appendChild(link); link.click(); document.body.removeChild(link); URL.revokeObjectURL(url);
  };
  
  const handlePrevRow = () => setPreviewRowIndex(i => Math.max(0, i - 1));
  const handleNextRow = () => setPreviewRowIndex(i => Math.min(parsedCsv.rows.length - 1, i + 1));

  const handleSaveConfig = () => {
    try {
      const config = { textFields, imageFields, filenamePattern };
      const configJson = JSON.stringify(config, null, 2);
      const blob = new Blob([configJson], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'credencial_config.json';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) { setError("No se pudo guardar la configuración."); }
  };

  const handleRestoreConfig = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const result = event.target?.result;
        if (typeof result === 'string') {
          const config = JSON.parse(result);
          if (config.textFields && Array.isArray(config.textFields) &&
              config.imageFields && Array.isArray(config.imageFields) &&
              typeof config.filenamePattern === 'string') {
            setTextFields(config.textFields);
            setImageFields(config.imageFields);
            setFilenamePattern(config.filenamePattern);
            setError(null);
          } else { throw new Error("El archivo de configuración tiene un formato inválido."); }
        }
      } catch (err: any) { setError(`Error al cargar configuración: ${err.message}`); }
    };
    reader.onerror = () => setError("No se pudo leer el archivo de configuración.");
    reader.readAsText(file);
    e.target.value = '';
  };
  
  const triggerRestore = () => {
    restoreInputRef.current?.click();
  };

  const magnifierSize = 128; const zoomLevel = 2;
  const previewScale = previewImageRef.current && imageDimensions ? previewImageRef.current.clientWidth / imageDimensions.width : 1;
  const currentPreviewRow = parsedCsv.rows[previewRowIndex];

  return (
    <div className="min-h-screen bg-slate-900 text-slate-200 font-sans p-4 sm:p-6 lg:p-8">
      <div className="max-w-7xl mx-auto">
        <Header />
        <Instructions />
        <div className="mt-8 grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
          <div className="flex flex-col gap-6">
            <div className="relative">
              <label htmlFor="imageTemplate" className="block text-sm font-medium text-slate-400 mb-2">1. Carga tu Plantilla de Imagen</label>
              <input id="imageTemplate" type="file" accept="image/png, image/jpeg" onChange={handleImageChange} className="w-full text-sm text-slate-400 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-indigo-600 file:text-white hover:file:bg-indigo-500" />
              <ErrorBubble error={validationErrors.templateImage} />
              {imagePreview && (
                 <div className="mt-4 relative inline-block cursor-crosshair" onMouseMove={handleMouseMoveOnImage} onMouseLeave={handleMouseLeaveImage}>
                    <img ref={imageRef} src={imagePreview} alt="Vista previa de la plantilla" className="rounded-md border border-slate-700 max-h-60 w-auto" onLoad={(e) => setImageDimensions({ width: e.currentTarget.naturalWidth, height: e.currentTarget.naturalHeight })} />
                    {showGrid && <div className="absolute top-0 left-0 w-full h-full pointer-events-none" style={{ backgroundImage: `linear-gradient(rgba(255,255,255,0.2) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.2) 1px, transparent 1px)`, backgroundSize: '50px 50px' }}></div>}
                    {mousePosition && showGrid && isZoomActive && <div className="absolute bg-slate-900/80 text-white text-xs rounded px-2 py-1 pointer-events-none z-20" style={{ top: `${mousePosition.offsetY - magnifierSize / 2 - 20}px`, left: `${mousePosition.offsetX}px`, transform: 'translate(-50%, -50%)' }}>X: {mousePosition.trueX}, Y: {mousePosition.trueY}</div>}
                    {imagePreview && showGrid && mousePosition && imageDimensions && isZoomActive && <div className="absolute rounded-full border-2 border-white shadow-lg pointer-events-none z-10" style={{ top: `${mousePosition.offsetY - magnifierSize / 2}px`, left: `${mousePosition.offsetX - magnifierSize / 2}px`, width: `${magnifierSize}px`, height: `${magnifierSize}px`, backgroundImage: `url(${imagePreview})`, backgroundSize: `${imageDimensions.width * zoomLevel}px ${imageDimensions.height * zoomLevel}px`, backgroundPosition: `-${mousePosition.trueX * zoomLevel - magnifierSize / 2}px -${mousePosition.trueY * zoomLevel - magnifierSize / 2}px`, backgroundRepeat: 'no-repeat' }} />}
                </div>
              )}
               {imagePreview && <button onClick={() => setShowGrid(!showGrid)} className="mt-2 w-full text-sm text-slate-400 border border-slate-600 rounded-md py-2 hover:bg-slate-700/50 transition-colors flex items-center justify-center"><span>{showGrid ? "Ocultar Malla" : "Mostrar Malla"}</span>{showGrid && <span className="text-xs text-slate-500 ml-2 font-normal">(Mantén 'Alt' para Lupa)</span>}</button>}
            </div>

            <div className="relative">
              <label htmlFor="excelUpload" className="block text-sm font-medium text-slate-400 mb-2">2. Sube tu Archivo de Datos</label>
              <input id="excelUpload" type="file" accept=".xlsx, .xls, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/vnd.ms-excel" onChange={handleExcelUpload} className="w-full text-sm text-slate-400 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-indigo-600 file:text-white hover:file:bg-indigo-500" />
              {excelFilename && <p className="text-xs text-slate-400 mt-2">Archivo cargado: <span className="font-medium text-slate-300">{excelFilename}</span></p>}
              <ErrorBubble error={validationErrors.csvData} />
            </div>
            
            <div className="relative">
              <label htmlFor="photoUpload" className="block text-sm font-medium text-slate-400 mb-2">3. Carga las Fotos</label>
              <input id="photoUpload" type="file" accept="image/png, image/jpeg, image/gif" multiple onChange={handlePhotoUpload} className="w-full text-sm text-slate-400 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-indigo-600 file:text-white hover:file:bg-indigo-500" />
              <ErrorBubble error={validationErrors.photoUpload} />
              {photoUploadStatus && <p className="text-xs text-slate-400 mt-2">{photoUploadStatus}</p>}
            </div>

            <div>
              <h3 className="text-sm font-medium text-slate-400 mb-2">4. Define los Campos</h3>
              <div className="flex gap-2 mb-4">
                 <button onClick={handleSaveConfig} className="flex-1 flex items-center justify-center gap-2 text-sm text-slate-300 bg-slate-700 hover:bg-slate-600 rounded-md py-2 transition-colors">
                     <Icon name="save" className="w-4 h-4" />
                     Guardar Configuración
                 </button>
                 <button onClick={triggerRestore} className="flex-1 flex items-center justify-center gap-2 text-sm text-slate-300 bg-slate-700 hover:bg-slate-600 rounded-md py-2 transition-colors">
                     <Icon name="upload" className="w-4 h-4" />
                     Restaurar Configuración
                 </button>
              </div>
              <input type="file" ref={restoreInputRef} onChange={handleRestoreConfig} accept=".json,application/json" style={{ display: 'none' }} />
              
              <div className="space-y-4">
                <h4 className="text-xs font-bold uppercase text-slate-500 tracking-wider">Campos de Texto</h4>
                {textFields.map((field) => (
                  <div key={field.id} className="grid grid-cols-12 gap-2 p-3 bg-slate-800 border border-slate-700 rounded-md">
                     <div className="col-span-12 relative"><label className="text-xs text-slate-500">Contenido</label><textarea value={field.content} onChange={e => handleFieldChange(field.id, 'content', e.target.value)} className="w-full bg-slate-700 border-slate-600 rounded p-1 text-sm font-mono" rows={2} /><ErrorBubble error={validationErrors[`textField_${field.id}_content`]} /></div>
                     <div className="col-span-2"><label className="text-xs text-slate-500">X</label><input type="number" value={field.x} onChange={e => handleFieldChange(field.id, 'x', parseInt(e.target.value) || 0)} className="w-full bg-slate-700 border-slate-600 rounded p-1 text-sm"/></div>
                     <div className="col-span-2"><label className="text-xs text-slate-500">Y</label><input type="number" value={field.y} onChange={e => handleFieldChange(field.id, 'y', parseInt(e.target.value) || 0)} className="w-full bg-slate-700 border-slate-600 rounded p-1 text-sm"/></div>
                     <div className="col-span-2"><label className="text-xs text-slate-500">Tamaño</label><input type="number" value={field.fontSize} onChange={e => handleFieldChange(field.id, 'fontSize', parseInt(e.target.value) || 0)} className="w-full bg-slate-700 border-slate-600 rounded p-1 text-sm"/></div>
                     <div className="col-span-2"><label className="text-xs text-slate-500">Color</label><input type="color" value={field.color} onChange={e => handleFieldChange(field.id, 'color', e.target.value)} className="w-full bg-slate-700 border-slate-600 rounded p-1 text-sm h-8"/></div>
                     <div className="col-span-4 flex items-end gap-2"><button onClick={() => handleFieldChange(field.id, 'isBold', !field.isBold)} className={`w-1/2 h-8 text-sm font-bold rounded ${field.isBold ? 'bg-indigo-500 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'}`} title="Negrita">N</button><button onClick={() => handleFieldChange(field.id, 'isItalic', !field.isItalic)} className={`w-1/2 h-8 text-sm italic font-serif rounded ${field.isItalic ? 'bg-indigo-500 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'}`} title="Cursiva">C</button></div>
                     <div className="col-span-12"><button onClick={() => handleRemoveField(field.id)} className="text-xs text-red-400 hover:text-red-300">Eliminar campo de texto</button></div>
                  </div>
                ))}
                 <button onClick={handleAddField} className="w-full text-sm text-indigo-400 border border-indigo-500/50 rounded-md py-2 hover:bg-indigo-500/10 transition-colors">Añadir Campo de Texto</button>
              </div>

              <div className="space-y-4 mt-6">
                <h4 className="text-xs font-bold uppercase text-slate-500 tracking-wider">Campos de Imagen</h4>
                 {imageFields.map((field) => (
                  <div key={field.id} className="grid grid-cols-12 gap-2 p-3 bg-slate-800 border border-slate-700 rounded-md">
                     <div className="col-span-12 relative">
                        <label className="text-xs text-slate-500">Columna de Vínculo (Nombre de Foto)</label>
                        <div className="relative">
                            <select value={field.linkColumn} onChange={e => handleImageFieldChange(field.id, 'linkColumn', e.target.value)} className="w-full bg-slate-700 border-slate-600 rounded p-1.5 text-sm appearance-none">
                                <option value="" disabled>-- Selecciona Columna --</option>
                                {parsedCsv.headers.map(header => (<option key={header} value={header}>{header.charAt(0).toUpperCase() + header.slice(1)}</option>))}
                            </select>
                            <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-slate-400"><svg className="fill-current h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z"/></svg></div>
                        </div>
                        <ErrorBubble error={validationErrors[`imageField_${field.id}_linkColumn`]} />
                     </div>
                     <div className="col-span-2"><label className="text-xs text-slate-500">X</label><input type="number" value={field.x} onChange={e => handleImageFieldChange(field.id, 'x', parseInt(e.target.value) || 0)} className="w-full bg-slate-700 border-slate-600 rounded p-1 text-sm"/></div>
                     <div className="col-span-2"><label className="text-xs text-slate-500">Y</label><input type="number" value={field.y} onChange={e => handleImageFieldChange(field.id, 'y', parseInt(e.target.value) || 0)} className="w-full bg-slate-700 border-slate-600 rounded p-1 text-sm"/></div>
                     <div className="col-span-2"><label className="text-xs text-slate-500">Ancho</label><input type="number" value={field.width} onChange={e => handleImageFieldChange(field.id, 'width', parseInt(e.target.value) || 0)} className="w-full bg-slate-700 border-slate-600 rounded p-1 text-sm"/></div>
                     <div className="col-span-2"><label className="text-xs text-slate-500">Alto</label><input type="number" value={field.height} onChange={e => handleImageFieldChange(field.id, 'height', parseInt(e.target.value) || 0)} className="w-full bg-slate-700 border-slate-600 rounded p-1 text-sm"/></div>
                     <div className="col-span-2"><label className="text-xs text-slate-500">Grosor Borde</label><input type="number" value={field.frame?.thickness || 0} onChange={e => handleImageFieldChange(field.id, 'frame', { ...field.frame, thickness: Math.max(0, parseInt(e.target.value) || 0) })} className="w-full bg-slate-700 border-slate-600 rounded p-1 text-sm"/></div>
                     <div className="col-span-2"><label className="text-xs text-slate-500">Color Borde</label><input type="color" value={field.frame?.color || '#FFFFFF'} onChange={e => handleImageFieldChange(field.id, 'frame', { ...field.frame, color: e.target.value })} className="w-full bg-slate-700 border-slate-600 rounded p-1 text-sm h-8"/></div>
                     <div className="col-span-12 mt-1"><button onClick={() => handleRemoveImageField(field.id)} className="text-xs text-red-400 hover:text-red-300">Eliminar campo de imagen</button></div>
                  </div>
                ))}
                <button onClick={handleAddImageField} className="w-full text-sm text-indigo-400 border border-indigo-500/50 rounded-md py-2 hover:bg-indigo-500/10 transition-colors">Añadir Campo de Imagen</button>
              </div>
            </div>
            
            <div className="relative">
                <label htmlFor="filenamePattern" className="block text-sm font-medium text-slate-400 mb-2">5. Define el Patrón de Nombre de Archivo</label>
                <input id="filenamePattern" type="text" value={filenamePattern} onChange={(e) => setFilenamePattern(e.target.value)} className="w-full bg-slate-800 border border-slate-700 rounded-md p-3 text-sm font-mono focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-colors" placeholder="Ej: credencial-{{id}}.png" />
                <ErrorBubble error={validationErrors.filenamePattern} />
                <p className="text-xs text-slate-500 mt-1">Usa marcadores como `{'{{nombre}}'}`. No olvides la extensión (.png).</p>
            </div>

            <button onClick={handleGenerate} disabled={isLoading || Object.keys(validationErrors).length > 0} className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-800 disabled:text-slate-400 disabled:cursor-not-allowed text-white font-bold py-3 px-4 rounded-md transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-900 focus:ring-indigo-500">
              {isLoading ? (<><Icon name="loading" />Generando...</>) : (<><Icon name="generate" />6. Generar Credenciales</>)}
            </button>
            {error && <p className="text-red-400 bg-red-900/50 p-3 rounded-md text-sm mt-4">{error}</p>}
          </div>

          <div className="lg:sticky lg:top-8 flex flex-col gap-8">
            <div>
              <h3 className="text-sm font-medium text-slate-400 mb-2">Vista Previa en Vivo</h3>
              <div className="bg-slate-800 border border-slate-700 rounded-md p-3">
                {imagePreview && parsedCsv.rows.length > 0 ? (
                  <>
                    <div className="flex items-center justify-between mb-3">
                      <label className="text-xs text-slate-400">Fila de Datos:</label>
                      <div className="flex items-center gap-2">
                        <button onClick={handlePrevRow} disabled={previewRowIndex === 0} className="px-2 py-1 bg-slate-700 rounded disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-600 text-xs">Anterior</button>
                        <span className="text-sm font-mono bg-slate-900 px-2 py-1 rounded">{previewRowIndex + 1} / {parsedCsv.rows.length}</span>
                        <button onClick={handleNextRow} disabled={previewRowIndex >= parsedCsv.rows.length - 1} className="px-2 py-1 bg-slate-700 rounded disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-600 text-xs">Siguiente</button>
                      </div>
                    </div>
                    <div className="relative w-full overflow-hidden">
                      <img ref={previewImageRef} src={imagePreview} alt="Vista previa en vivo" className="w-full h-auto rounded-md" />
                      {imageFields.map(field => (
                        <LivePreviewImage
                          key={`preview-img-${field.id}`}
                          field={field}
                          currentPreviewRow={currentPreviewRow}
                          headers={parsedCsv.headers}
                          photoFiles={photoFiles}
                          scale={previewScale}
                        />
                      ))}
                      {textFields.map(field => (
                        <div key={`preview-${field.id}`} style={{ position: 'absolute', left: `${(field.x || 0) * previewScale}px`, top: `${(field.y || 0) * previewScale}px`, fontSize: `${(field.fontSize || 0) * previewScale}px`, color: field.color, fontFamily: 'sans-serif', fontWeight: field.isBold ? 'bold' : 'normal', fontStyle: field.isItalic ? 'italic' : 'normal', whiteSpace: 'pre-wrap', lineHeight: 1.2 }}>
                           {replacePlaceholders(field.content, parsedCsv.headers, currentPreviewRow)}
                        </div>
                      ))}
                    </div>
                  </>
                ) : (
                  <div className="text-center text-slate-500 text-sm py-8">
                    {imagePreview ? "Sube un archivo de datos para ver la vista previa." : "Carga una imagen y datos para activar la vista previa."}
                  </div>
                )}
              </div>
            </div>
            
            <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-4 flex flex-col">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-lg font-semibold text-slate-300">Resultados Generados</h2>
                <button onClick={handleDownloadAll} disabled={generatedCredentials.length === 0} className="flex items-center gap-2 text-sm bg-slate-700 hover:bg-slate-600 disabled:bg-slate-800 disabled:text-slate-500 disabled:cursor-not-allowed text-white font-semibold py-2 px-4 rounded-md transition-colors duration-200">
                  <Icon name="download" />Descargar Todo (.zip)
                </button>
              </div>
              <div className="flex-grow overflow-y-auto pr-2 space-y-4 h-96 lg:h-[calc(100vh-10rem-300px)]" style={{ scrollbarWidth: 'thin', scrollbarColor: '#475569 #1e293b' }}>
                {generatedCredentials.length > 0 ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {generatedCredentials.map((cred, index) => (
                       <div key={index} className="relative group rounded-md overflow-hidden">
                          <img src={cred.dataUrl} alt={`Credencial generada ${cred.filename}`} className="w-full border-2 border-slate-700 block" />
                          <div className="absolute inset-0 bg-black/60 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                            <a href={cred.dataUrl} download={cred.filename} className="flex items-center gap-2 text-sm bg-indigo-600 hover:bg-indigo-500 text-white font-semibold py-2 px-4 rounded-md transition-colors duration-200">
                              <Icon name="download" className="w-4 h-4" />Descargar PNG
                            </a>
                          </div>
                        </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center h-full text-center text-slate-500">
                    <Icon name="placeholder" /><p className="mt-2">Tus credenciales generadas aparecerán aquí.</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default App;
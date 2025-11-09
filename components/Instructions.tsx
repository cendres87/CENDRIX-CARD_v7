import React from 'react';

export const Instructions: React.FC = () => {
  return (
    <div className="max-w-4xl mx-auto bg-slate-800/50 border border-slate-700 rounded-lg p-6">
      <h2 className="text-xl font-bold text-white mb-3">¿Cómo funciona?</h2>
      <ol className="list-decimal list-inside space-y-2 text-slate-300">
        <li>
          <strong>Carga una Plantilla:</strong> Sube una imagen (JPG o PNG) que servirá como fondo.
        </li>
         <li>
          <strong>Sube tu Archivo de Datos:</strong> Haz clic para seleccionar un archivo de Excel (.xlsx, .xls). La primera fila de la hoja debe contener los encabezados (ej., <code>id,nombre,puesto</code>).
        </li>
        <li>
          <strong>Carga las Fotos:</strong> Selecciona todos los archivos de imagen. **El nombre de cada archivo (sin la extensión) debe coincidir con un valor de la columna que vincules en los 'Campos de Imagen'.**
        </li>
        <li>
          <strong>Define los Campos:</strong> Añade campos de texto y de imagen. Para texto, usa marcadores <code>{'{{columna}}'}</code>. Para imágenes, define su posición, tamaño y añade un marco opcional.
        </li>
        <li>
          <strong>Genera:</strong> Haz clic en "Generar" para crear una credencial para cada fila de tus datos.
        </li>
      </ol>
      <p className="text-xs text-slate-400 mt-4 pt-4 border-t border-slate-700">
        <strong className="text-indigo-400">¡No te preocupes por perder tu trabajo!</strong> La configuración de tus campos (paso 4) y el patrón de nombre de archivo (paso 5) se guardan automáticamente en tu navegador para la próxima vez que visites.
      </p>
    </div>
  );
};
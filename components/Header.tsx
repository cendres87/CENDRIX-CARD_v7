import React from 'react';

export const Header: React.FC = () => {
  return (
    <header className="text-center mb-8">
      <h1 className="text-4xl font-extrabold text-white sm:text-5xl md:text-6xl tracking-tight">
        CENDRIX-CARD
      </h1>
      <p className="mt-4 max-w-2xl mx-auto text-lg text-slate-400">
        Crea credenciales visuales al instante a partir de una plantilla de imagen y un archivo de datos.
      </p>
    </header>
  );
};
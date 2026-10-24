# GMAO Intelligence — webapp estática

Panel estático para analizar órdenes de trabajo CMMS/GMAO. El procesamiento, los filtros, los gráficos y la preparación del PDF se ejecutan en el navegador; no necesita backend, Python ni instalación de paquetes.

## Ejecutar localmente

1. Abre una terminal dentro de `webapp`.
2. Inicia un servidor estático, por ejemplo:

   ```powershell
   python -m http.server 8000
   ```

3. Abre `http://localhost:8000/`.
4. Selecciona o arrastra un archivo CSV, XLSX o XLS.

No se requiere una carpeta `dataset` ni se publican datos de ejemplo. Cada persona carga su propio archivo. El navegador necesita conexión a Internet para cargar Chart.js, PapaParse, SheetJS y jsPDF desde jsDelivr/CDNJS. Los archivos del usuario se procesan en memoria y no se transmiten.

## Publicar en GitHub Pages

1. Crea un repositorio nuevo que contenga únicamente los archivos de esta carpeta (`index.html`, `app.js` y `styles.css`, además de este README). No subas la carpeta `dataset` ni el resto del proyecto.
2. En **Settings → Pages**, selecciona **Deploy from a branch**, elige la rama publicada y la carpeta raíz (`/`).
3. Espera a que finalice el despliegue y comparte `https://<usuario>.github.io/<repositorio>/`.

La aplicación no incluye datasets: cada persona carga su propio archivo. Los archivos se procesan en el navegador y no se transmiten a un servidor. El navegador requiere conexión a Internet para cargar las bibliotecas públicas indicadas arriba.

## Formato de datos

Se requiere un encabezado `OT` y otro `Tipo_mantenimiento`. Para los indicadores disponibles se reconocen, entre otras, las columnas `Fecha_inicio`, `Fecha_fin`, `Estado`, `Equipo`, `Tipo_equipo`, `Criticidad`, `Modo_falla`, `Downtime_h`, `Horas_mano_obra` y `Costo_total_CLP`. Se aceptan los nombres originales del notebook, con tildes y guiones bajos.

El panel normaliza espacios, caracteres invisibles, apóstrofos de Excel, mayúsculas y variantes de categorías como ` CORRECTIVO `/`Correctivo` y `preventiva`/`Preventivo` antes de agrupar; informa qué categorías tenían variantes en el archivo. El MTTR considera órdenes correctivas cerradas con fechas válidas y duración positiva. Los cuadrantes Jack-Knife son una guía de priorización calculada con frecuencia y downtime medio por falla. La paleta es consistente: correctivo en rojo suave, preventivo en verde azulado y predictivo en azul.

## Contenido

- `index.html`: estructura de la aplicación y dependencias públicas.
- `styles.css`: presentación adaptable a escritorio y dispositivos móviles.
- `app.js`: carga, normalización, métricas, filtros, gráficos e informe PDF.

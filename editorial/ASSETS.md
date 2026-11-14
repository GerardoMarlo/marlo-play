# Recursos gráficos

No se generaron imágenes con IA. La portada utiliza una composición CSS neutral,
no la fotografía de un producto. Los productos demo solo existen en local.
El gestor de contenido permite reemplazar referencias HTTPS sin editar código.

| Recurso | Tamaño recomendado | Formato | Campo |
|---|---|---|---|
| Logotipo | 600 × 240, fondo transparente | SVG seguro o WebP | logo |
| Banner desktop | 1600 × 1600; zona segura central | WebP/AVIF | heroDesktop |
| Banner móvil | 900 × 900 | WebP/AVIF | heroMobile |
| Portada de juego | 1200 × 900 (4:3) | WebP/AVIF | producto.image |
| Galería | 1600 × 1200 (4:3) | WebP/AVIF | producto.gallery |
| Editorial | 1200 × 900 | WebP/AVIF | aboutImage |
| Mayoreo | 1200 × 900 | WebP/AVIF | wholesaleImage |
| Reglamento | PDF accesible, texto seleccionable | PDF | producto.rules |

Usar textos alternativos que describan el recurso; el nombre del producto se usa
como valor inicial. Mantener texto esencial fuera de la imagen. Preferir menos
de 250 KB por imagen. Publicar archivos en R2 con dominio propio HTTPS o en un
almacenamiento de confianza. No usar URLs temporales ni incluir secretos.
Los espacios neutrales mantienen proporciones; sus identificadores aparecen
solo en desarrollo. No hay reseñas, premios ni productos comerciales inventados.

## Rediseño y lanzamiento: Intercambio Navideño

Ver [ASSETS-INTERCAMBIO.md](ASSETS-INTERCAMBIO.md) para el inventario, dimensiones, pesos y fuentes exactas de `E:/Carbon para ti`. Originales seleccionados conservados en `assets-originals/intercambio-navideno`; solo derivados WebP se incluyen en `public/images/intercambio-navideno`.

Uso final: `juego-de-mesa`, `abrazo` y `audifonos` forman el hero y la tarjeta del catálogo; la galería añade `bufanda`, `planta`, `sueter-feo`, `taza-navidena` y `yo-queria-ese`. La imagen principal se usa también para Open Graph. Miniaturas de 160 px y versiones de 450 px reducen la descarga; las de 900 px se conservan para ampliar. No hay empaque ni fotografía física inventados.

Las fuentes Fraunces (600/800) y DM Sans (400/600) se empaquetan localmente mediante @fontsource con licencia OFL; no hay petición a Google Fonts al visitar el sitio. Se mantienen los créditos y licencias en los paquetes instalados.

El administrador puede cambiar imagen/galería del producto, escoger lanzamiento destacado y reemplazar los banners desktop/móvil mediante URLs HTTPS. Los colores y la familia tipográfica temática son campos del producto; las ilustraciones no se editan para adaptarlas al tema.

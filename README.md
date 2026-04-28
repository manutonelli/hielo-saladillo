# Hielo Saladillo

Catálogo web de pedidos para **Hielo Saladillo**, distribuidora de hielo y helados en Saladillo, Buenos Aires.

## Páginas

| URL | Descripción |
|-----|-------------|
| `/` | Página principal |
| `/mayorista` | Catálogo con precios mayoristas |
| `/minorista` | Catálogo con precios minoristas |

## Funcionalidades

- Catálogo de productos organizado por marca (Hielo, Acapulco, Dolce Neve, Queen, Granel)
- Precios diferenciados por modalidad (mayorista / minorista)
- Carrito de compras con contador de ítems
- Envío de pedido directamente por **WhatsApp**
- Opciones de entrega: delivery a domicilio o retiro en local
- Mapa embebido con la ubicación del local

## Stack

- HTML + CSS + JavaScript (React vía CDN, sin build step)
- Sin dependencias de backend — todo corre en el browser

## Estructura

```
/
├── index.html          # Página principal
├── mayorista.html      # Catálogo mayorista
├── minorista.html      # Catálogo minorista
├── logo.png            # Logo original (fondo blanco)
├── logo-white.png      # Logo con "Saladillo" en blanco (para fondo oscuro)
├── vercel.json         # Rewrites para URLs limpias en Vercel
└── README.md
```

## Deploy

El proyecto está configurado para **Vercel**. Al hacer push a `main`, Vercel despliega automáticamente.

El archivo `vercel.json` mapea las rutas limpias:

```json
{
  "rewrites": [
    { "source": "/mayorista", "destination": "/mayorista.html" },
    { "source": "/minorista", "destination": "/minorista.html" }
  ]
}
```

## Configuración

Las variables principales están al inicio del script en cada archivo HTML:

```js
const WA_NUMBER = "5492345685143"; // Número de WhatsApp
const ADMIN_PIN = "";          // PIN de acceso admin
```

## Contacto

📍 Reynoso 3296 (esq. Mitre) · Saladillo, Buenos Aires

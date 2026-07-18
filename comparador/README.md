# Comparador de precios

Aplicación Next.js para rastrear y comparar precios de supermercados.

## Panel de rastreo

El rastreo manual de Eroski está disponible en:

```text
http://localhost:3000/admin/rastreo
```

Antes de usarlo, añade a `.env.local` una clave aleatoria de al menos 16 caracteres:

```bash
ADMIN_RASTREO_TOKEN=pon-aqui-una-clave-larga-y-aleatoria
CRON_SECRET=pon-aqui-otra-clave-larga-y-aleatoria
SMTP_HOST=smtp.ejemplo.net
SMTP_PORT=587
SMTP_USER=correo@ejemplo.net
SMTP_PASSWORD=contraseña-smtp
SMTP_FROM_EMAIL=correo@ejemplo.net
SMTP_SECURE=false
SMTP_REPORT_TO=destinatario@ejemplo.net
```

En producción, configura la misma variable en Vercel. La previsualización no escribe
en Supabase; la opción **Rastrear y guardar** inserta productos nuevos y añade precios
al histórico.

## Solicitudes de productos no encontrados

Ejecuta una vez en el **SQL Editor** de Supabase la migración:

```text
supabase/migrations/20260717150000_solicitudes_rastreo.sql
```

Después, las búsquedas normales sin resultados se añadirán automáticamente a una
cola, con un máximo de un incremento por visitante anonimizado y día. La cola se
gestiona desde:

```text
http://localhost:3000/admin/solicitudes-rastreo
```

El servidor utiliza `ADMIN_RASTREO_TOKEN` como clave del HMAC que se emplea para
seudonimizar al solicitante. Nunca se guarda la dirección IP.

## Rastreos automáticos

Los ocho supermercados se actualizan diariamente mediante Vercel Cron. Los
horarios están definidos en `vercel.json` y siempre se interpretan en UTC.
Cada supermercado se ejecuta en una hora diferente para evitar concentrar todas
las peticiones en una misma función.

Vercel envía automáticamente `CRON_SECRET` como cabecera
`Authorization: Bearer ...`. Esta variable debe configurarse en el entorno
Production de Vercel y no debe coincidir con `ADMIN_RASTREO_TOKEN`.

Antes de desplegar hay que aplicar las migraciones de `supabase/migrations`.
La tabla `bloqueos_rastreo` evita que coincidan dos ejecuciones del mismo
supermercado, ya sean manuales o automáticas. Las ejecuciones programadas se
guardan en `ejecuciones_rastreo` con `tipo_rastreo = automatico`.

Después del último rastreo se envía un informe diario por correo mediante la
ruta `/api/cron/informe-rastreos`. El envío está programado a las 09:30 UTC e
incluye el estado, duración, productos, nuevos productos, precios y errores de
cada supermercado.

Para el puerto SMTP 587 debe utilizarse `SMTP_SECURE=false`: la conexión comienza
sin TLS implícito y se actualiza mediante STARTTLS. Todas las variables SMTP
deben configurarse también en el entorno Production de Vercel.
`SMTP_REPORT_TO` es opcional y permite cambiar el destinatario predeterminado.
Los envíos completados se registran en `informes_rastreo_enviados` para evitar
correos duplicados.

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

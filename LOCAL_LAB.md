# Núcleo operativo local

Arrancar con `npm run lab`; API en `http://127.0.0.1:3001`. Interfaz en el repositorio hermano `diginode-client`, con `npm run lab` y `http://127.0.0.1:5174/lab.html`.

Guía del recorrido: `diginode-client/PRUEBA_DIGINODE.md`. Este servidor es independiente de `src/server.js` y `src/app.js`: no carga dotenv ni proveedores. Rechaza `NODE_ENV=production`, hosts externos, orígenes de navegador ajenos y peticiones sin una sesión local acotada al negocio seleccionado.

`src/operations` contiene catálogo, contratos de entrada, fixtures, adaptador local y servicio de operaciones. `local_app.js` publica únicamente las rutas del laboratorio. Las sesiones permiten elegir entre dos perfiles ficticios: no constituyen autenticación de producción.

Datos persistentes en `.local-lab/state.json`, ignorados por Git. Un bloqueo evita dos escritores; las transacciones se guardan atómicamente y una transacción fallida no altera el estado. El procesador entrega a una bandeja sandbox y no envía nada a correo, Meta o Stripe. Los jobs registran revisión de contenido, clave de deduplicación, intentos y estado final.

Pruebas: `npm run lab:test` para el núcleo; `npm test` para todas las pruebas. Es necesario validar un adaptador de base real, autorización, aislamiento, proveedor IA y cada canal antes de conectar esta lógica a producción. El catálogo nuevo no modifica el plan publicado ni ninguna suscripción existente.

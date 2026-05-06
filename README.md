# Agenda del Escribano Martin Acosta

Aplicacion de escritorio local para Windows con base de datos SQLite.

## Como instalarla

1. Hacer doble clic en `Agenda-Martin-Acosta-Setup.exe`.
2. El instalador crea un acceso directo profesional en el Escritorio y otro en el menu Inicio.
3. Abrir la agenda desde `Agenda Martin Acosta`.

Si Windows pregunta si se permite ejecutar el instalador, aceptar solamente si el archivo vino de la carpeta entregada.

Tambien se puede instalar desde la carpeta descomprimida con `Instalar-Agenda-Martin-Acosta.bat`.

La instalacion no requiere permisos de administrador. El programa se instala en:

```text
%LOCALAPPDATA%\Programs\AgendaMartinAcosta
```

Los datos se guardan separados del programa, en:

```text
%LOCALAPPDATA%\AgendaMartinAcosta\datos
```

Esto evita perder la base si se reemplaza o actualiza la carpeta del programa.

## Como ejecutarla sin instalar

1. Descomprimir la carpeta de la agenda.
2. Hacer doble clic en `Agenda-Martin-Acosta.exe` si esta disponible, o en `Agenda-Martin-Acosta.bat`.
3. Se abre una ventana tipo aplicacion. Usar la agenda desde ahi.
4. Al cerrar la ventana de la aplicacion, el motor local se apaga solo.

Tambien se puede ejecutar `instalar-acceso-directo.bat` para crear un acceso directo en el Escritorio.

## Guardado de datos

Las citas se guardan en:

```text
%LOCALAPPDATA%\AgendaMartinAcosta\datos\agenda_martin_acosta.db
```

Ese archivo es la base real. No borrarlo.

La agenda guarda cada cita, recordatorio, bloqueo y cambio de horario inmediatamente en la base SQLite. Si hay datos escritos en un formulario sin guardar, la aplicacion avisa antes de cerrar.

## Agenda semanal

La pestaña `Agenda` muestra una semana completa. Se puede avanzar o retroceder semana por semana, volver a `Hoy`, filtrar por estado y hacer clic en un dia para ver el detalle.

## Recordatorios y notificaciones

En `Agenda` se pueden crear recordatorios con fecha y hora. Para que Windows muestre avisos, presionar `Activar notificaciones`.

Las notificaciones aparecen cuando la app esta abierta. Si Windows o el navegador bloquean permisos, los recordatorios quedan guardados igual y se ven dentro de la app.

## Caja de la escribania

La pestaña `Caja` permite cargar ingresos y gastos del estudio:

- Pagos de firmas, certificaciones, escrituras, consultas y anticipos.
- Gastos de tasas, timbres, servicios, insumos, traslados e impuestos.
- Medio de pago, cliente o proveedor, concepto y observaciones.
- Filtro por mes y por tipo de movimiento.
- Cierre mensual de ingresos, egresos, saldo y cantidad de movimientos.

Los movimientos y cierres quedan guardados en la misma base SQLite local.

## Clientes

La pestaña `Clientes` permite mantener fichas completas:

- Nombre, documento, telefono, email y direccion.
- Observaciones internas.
- Historial operativo resumido de citas y pagos asociados.
- Busqueda rapida por nombre, documento, telefono o email.

Cuando se crea una cita, la app tambien crea o actualiza automaticamente una ficha basica del cliente.

## Tramites y documentos

La pestaña `Tramites` permite seguir trabajos notariales completos:

- Cliente asociado.
- Tipo de tramite.
- Estado: iniciado, esperando documentos, en redaccion, listo para firma o finalizado.
- Fecha limite y honorarios estimados.
- Checklist automatico de documentos segun el tipo de tramite.

Cada documento se puede marcar como pendiente o recibido.

## Pagos pendientes

Dentro de `Caja` se pueden registrar cobros esperados:

- Cliente.
- Concepto.
- Fecha de vencimiento.
- Importe.
- Estado pendiente, pagado o cancelado.

## Dashboard

La pestaña `Dashboard` muestra indicadores utiles para el estudio:

- Saldo mensual, ingresos, gastos y promedio de ingresos por cita activa.
- Citas por tramite.
- Estados de agenda: pendientes, confirmadas y canceladas.
- Proximas citas y recordatorios activos.
- Tramites activos y pagos pendientes.

## Plantillas

La pestaña `Plantillas` genera mensajes listos para copiar:

- Confirmacion de cita.
- Documentacion pendiente.
- Pago pendiente.
- Tramite listo para firma.
- Reprogramacion de cita.

Tambien incluye un asistente de gestion con alertas sobre citas pendientes, pagos vencidos, documentacion faltante y saldo de caja.

## Mejoras incluidas

- Logo propio para la aplicacion y accesos directos.
- Busqueda por cliente, telefono, documento, tramite u observaciones.
- Caja administrativa con ingresos, gastos y cierres mensuales.
- Fichas de clientes.
- Gestion de tramites y documentos pendientes.
- Pagos pendientes.
- Plantillas de mensajes.
- PIN local y bloqueo automatico opcional.
- Dashboard de gestion notarial.
- Panel de seguridad de datos con ubicacion de base y backups.
- Boton de backup manual dentro de la app.
- Instalador y desinstalador local.
- Separacion entre archivos del programa y datos del usuario.

## Backups

La app crea un backup automatico diario al iniciar, dentro de:

```text
backups
```

Para hacer un backup manual, ejecutar:

```text
hacer-backup.bat
```

Recomendacion: copiar `%LOCALAPPDATA%\AgendaMartinAcosta` a OneDrive, Google Drive o un pendrive una vez por semana.

## Probar funcionamiento

Ejecutar `probar-app.bat`. La prueba levanta un servidor separado, crea una base temporal, crea una cita, verifica que no permita doble reserva, actualiza estados, bloquea horarios, crea recordatorios y elimina los datos de prueba.

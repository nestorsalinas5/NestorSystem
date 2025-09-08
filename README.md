
<h1>GestionSystemDj</h1>
<p><strong>Tu centro de control todo-en-uno para la gestión de eventos.</strong></p>
<p>Una aplicación web moderna y completa diseñada para DJs y organizadores de eventos, construida con React, TypeScript, Supabase y potenciada con la IA de Google Gemini.</p>
</div>
<div align="center">
<!-- Inserta aquí un screenshot de la app, por ejemplo del dashboard -->
  Login
<img width="1364" height="629" alt="image" src="https://github.com/user-attachments/assets/f62a00d2-9a64-4409-85d2-50116466abd5" />

Admin
<img width="1366" height="768" alt="image" src="https://github.com/user-attachments/assets/b6775faf-6911-4c88-83fe-1f510f29f563" />

User:
<img width="1366" height="768" alt="image" src="https://github.com/user-attachments/assets/6aa852e8-96e7-4d6f-8cba-94ac84b9af54" />


<img src="URL_DE_UN_SCREENSHOT_AQUI" alt="Dashboard de GestionSystemDj" />
</div>


✨ Introducción

GestionSystemDj es una solución de software como servicio (SaaS) que centraliza todas las operaciones necesarias para gestionar un negocio de eventos. Desde la captación de clientes potenciales con un formulario público, pasando por la creación de presupuestos profesionales, hasta la gestión de eventos y el análisis de la rentabilidad, esta plataforma lo cubre todo.
El sistema cuenta con dos roles principales: un panel de Usuario para los DJs/organizadores y un panel de Administrador para la gestión de la plataforma, todo con una interfaz de usuario limpia, responsiva y con modo claro/oscuro.

🚀 Características Principales

Panel de Usuario (DJ / Organizador de Eventos)

📊 Dashboard Analítico: Visualiza métricas clave de un vistazo. Gráficos de ingresos mensuales, gastos, ganancias netas y análisis de los clientes más recurrentes.
🤖 Insights con IA de Gemini: Recibe un análisis inteligente sobre el rendimiento de tu mes, con recomendaciones para optimizar tu negocio.
📋 Gestión de Consultas: Un portal público y un código QR únicos para que tus clientes potenciales te contacten. Las consultas llegan directamente a tu panel.

📄 Creador de Presupuestos:

Genera presupuestos detallados y profesionales.
Asistente IA de Gemini para sugerir ítems del presupuesto basado en la descripción del evento.
Exporta a PDF con tu logo y datos de empresa.
Envía los presupuestos por email directamente desde la app.
Recibe sugerencias de correos de seguimiento generadas por IA.

🗓️ Gestión de Eventos y Clientes (CRM): 

Un sistema completo para registrar todos tus eventos, clientes, gastos asociados y observaciones.

📅 Agenda Interactiva: 

Un calendario visual para no perder de vista ninguna fecha importante.

📈 Reportes Avanzados: 

Genera reportes de rendimiento por rango de fechas y expórtalos en formato PDF o CSV.

⚙️ Configuración Personalizada: 

Sube el logo de tu empresa y actualiza tus datos.

🔔 Sistema de Notificaciones: 

Recibe anuncios importantes del administrador del sistema.


Panel de Administrador

📈 Dashboard de Admin: Métricas globales de la plataforma: nuevos usuarios, licencias por vencer, total de eventos en el sistema.

👥 Gestión de Usuarios: Crea, edita y gestiona las cuentas de los usuarios, sus licencias y estado.

📢 Sistema de Anuncios: Crea y publica anuncios globales que se mostrarán a todos los usuarios en un modal.

✉️ Notificaciones Masivas: Envía notificaciones personalizadas a todos los usuarios de la plataforma.

📜 Registro de Actividad: Un log detallado de las acciones importantes que ocurren en el sistema para auditoría y seguimiento.

🛠️ Tech Stack (Tecnologías Utilizadas)


Frontend:

React: Biblioteca principal para la construcción de la interfaz.

TypeScript: Para un código más robusto y escalable.

Tailwind CSS: Para un diseño moderno y responsivo.

Recharts: Para la visualización de datos y gráficos.

Backend & Base de Datos (BaaS):

Supabase: La solución open-source que provee:

Autenticación: Gestión segura de usuarios y sesiones.

PostgreSQL Database: Almacenamiento de toda la información de la aplicación.

Storage: Para el alojamiento de logos de empresa y otros archivos.

Edge Functions: Funciones serverless para tareas como el envío de correos electrónicos y la creación de usuarios.

APIs Externas:

Google Gemini API: Para todas las funcionalidades de inteligencia artificial, como análisis, generación de texto y sugerencias.

Otros:

jsPDF & jspdf-autotable: Para la generación de reportes y presupuestos en PDF.

⚙️ Instalación y Puesta en Marcha Local

Para correr este proyecto en tu máquina local, sigue estos pasos:
Clona el repositorio:
code
Bash
git clone https://github.com/tu-usuario/gestionsystemdj.git
cd gestionsystemdj
Instala las dependencias. Este proyecto usa vite y un importmap, por lo que no es necesario un npm install tradicional para las librerías externas. Solo necesitas un servidor de desarrollo.
Configura las variables de entorno:
Crea un archivo .env en la raíz del proyecto y añade las siguientes claves. Necesitarás una cuenta en Supabase y una API Key de Google AI Studio.
code
Env
# URL de tu proyecto en Supabase
VITE_SUPABASE_URL="https://tu-id-de-proyecto.supabase.co"

# Anon Key pública de tu proyecto en Supabase
VITE_SUPABASE_ANON_KEY="tu-anon-key-publica"

# API Key para el API de Google Gemini
API_KEY="tu-api-key-de-gemini"
Inicia el servidor de desarrollo:
Si usas Vite, ejecuta:
code
Bash
npm install -D vite
npx vite

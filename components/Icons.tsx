
import React from 'react';

const iconProps = {
  className: "w-6 h-6",
  strokeWidth: "1.5",
  stroke: "currentColor",
  fill: "none",
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

export const DashboardIcon = () => (
  <svg {...iconProps} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
    <path d="M3 13V5C3 3.89543 3.89543 3 5 3H19C20.1046 3 21 3.89543 21 5V13C21 14.1046 20.1046 15 19 15H5C3.89543 15 3 14.1046 3 13Z" />
    <path d="M8 21L12 17L16 21" />
  </svg>
);

export const EventsIcon = () => (
  <svg {...iconProps} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
    <path d="M19 4H5C3.89543 4 3 4.89543 3 6V20C3 21.1046 3.89543 22 5 22H19C20.1046 22 21 21.1046 21 20V6C21 4.89543 20.1046 4 19 4Z" />
    <path d="M16 2V6" /><path d="M8 2V6" /><path d="M3 10H21" />
    <path d="M8 14H8.01" /><path d="M12 14H12.01" /><path d="M16 14H16.01" />
    <path d="M8 18H8.01" /><path d="M12 18H12.01" /><path d="M16 18H16.01" />
  </svg>
);

export const ClientsIcon = () => (
  <svg {...iconProps} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
    <path d="M17 21V19C17 16.7909 15.2091 15 13 15H5C2.79086 15 1 16.7909 1 19V21" />
    <path d="M9 11C11.2091 11 13 9.20914 13 7C13 4.79086 11.2091 3 9 3C6.79086 3 5 4.79086 5 7C5 9.20914 6.79086 11 9 11Z" />
    <path d="M23 21V19C22.9997 16.9542 21.4132 15.2427 19.3718 15.0423" />
    <path d="M16 11C18.0245 11.0003 19.8247 9.44431 20.1675 7.45785" />
  </svg>
);

export const ReportsIcon = () => (
  <svg {...iconProps} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
    <path d="M14 2H6C4.89543 2 4 2.89543 4 4V20C4 21.1046 4.89543 22 6 22H18C19.1046 22 20 21.1046 20 20V8L14 2Z" />
    <path d="M14 2V8H20" /><path d="M16 13H8" /><path d="M16 17H8" /><path d="M10 9H8" />
  </svg>
);

export const AgendaIcon = () => (
    <svg {...iconProps} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M8 2v4" />
        <path d="M16 2v4" />
        <rect width="18" height="18" x="3" y="4" rx="2" />
        <path d="M3 10h18" />
    </svg>
);

export const SettingsIcon = () => (
  <svg {...iconProps} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15C19.4 15 19.4 15 19.4 15C19.4 15 19.4 15 19.4 15C19.4 15 19.4 15 19.4 15C19.4 15 19.4 15 19.4 15C19.4 15 19.4 15 19.4 15C19.6455 14.5804 19.8221 14.1332 19.9244 13.6702C19.9882 13.374 20.0163 13.0725 20.0078 12.7706C19.9994 12.4687 19.9544 12.1693 19.8744 11.8798C19.7711 11.4158 19.5919 10.9679 19.3438 10.5488L19.3437 10.5488C19.222 10.3446 19.0833 10.1504 18.9288 9.96875L18.9288 9.96875C18.6258 9.61331 18.2887 9.28874 17.922 9.00001L17.922 9C17.5552 8.71126 17.1585 8.45934 16.7368 8.24833L16.7368 8.24833C16.3249 8.04259 15.8911 7.88118 15.4414 7.76836L15.4414 7.76836C14.9818 7.65279 14.5097 7.58661 14.0334 7.57143L14.0334 7.57143C13.5517 7.55609 13.0688 7.5928 12.5962 7.68063C12.1166 7.77028 11.6493 7.90995 11.206 8.09633C10.7673 8.28049 10.3542 8.50983 9.97441 8.77933L9.97441 8.77933C9.5937 9.04961 9.24584 9.35824 8.93751 9.70001L8.93751 9.7C8.62817 10.0427 8.36034 10.4185 8.13968 10.8208L8.13968 10.8208C7.91717 11.2266 7.74175 11.6575 7.61882 12.1062L7.61882 12.1062C7.49138 12.5682 7.41684 13.0456 7.39832 13.5284L7.39832 13.5284C7.37936 14.0189 7.41662 14.5103 7.50825 14.9882C7.6017 15.4741 7.74971 15.9472 7.94821 16.3988L7.94821 16.3988C8.14671 16.8504 8.39484 17.2791 8.68751 17.675L8.68751 17.675C8.98018 18.0709 9.31609 18.4352 9.68751 18.76L9.68751 18.76C10.0598 19.0857 10.4654 19.3752 10.9004 19.6242L10.9004 19.6242C11.3413 19.8767 11.8087 20.0871 12.2931 20.2494L12.2931 20.2494C12.7744 20.4081 13.2704 20.5173 13.7746 20.5739L13.7746 20.5739C14.2831 20.6293 14.7963 20.6309 15.3048 20.5788C15.8211 20.5258 16.3312 20.4182 16.8244 20.2588C17.313 20.0982 17.7836 19.8864 18.2294 19.6268L18.2294 19.6268C18.6761 19.3664 19.0963 19.0592 19.4828 18.7094L19.4828 18.7094L4.6 9L4.6 9C4.6 9 4.6 9 4.6 9L4.6 9Z" />
  </svg>
);

export const UserManagementIcon = () => (
    <svg {...iconProps} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
        <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
        <circle cx="8.5" cy="7" r="4"></circle>
        <path d="M20 8v6" />
        <path d="M23 11h-6" />
  </svg>
);

export const SunIcon = () => (
    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z"></path></svg>
);

export const MoonIcon = () => (
    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"></path></svg>
);

export const LogoutIcon = () => (
    <svg {...iconProps} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
        <path d="M9 21H5C3.89543 21 3 20.1046 3 19V5C3 3.89543 3.89543 3 5 3H9" />
        <path d="M16 17L21 12L16 7" />
        <path d="M21 12H9" />
    </svg>
);

export const CloseIcon = () => (
    <svg className="w-6 h-6" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
);

export const PlusIcon = () => (
    <svg className="w-5 h-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
    </svg>
);

export const TrashIcon = () => (
    <svg className="w-5 h-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.134-2.036-2.134H8.716c-1.12 0-2.037.953-2.037 2.134v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
    </svg>
);

export const MenuIcon = () => (
    <svg {...iconProps} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
        <path d="M4 6h16M4 12h16m-7 6h7"></path>
    </svg>
);

export const SuccessIcon = () => (
    <svg className="w-12 h-12 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path>
    </svg>
);

export const ErrorIcon = () => (
    <svg className="w-12 h-12 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
    </svg>
);

export const BellIcon = () => (
    <svg {...iconProps} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
        <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
        <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
);

export const WarningIcon = () => (
    <svg {...iconProps} className="w-5 h-5 text-yellow-500" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
        <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
        <line x1="12" y1="9" x2="12" y2="13"></line>
        <line x1="12" y1="17" x2="12.01" y2="17"></line>
    </svg>
);

export const AnnouncementIcon = () => (
    <svg {...iconProps} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
       <path d="M20 7H4a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1V8a1 1 0 0 0-1-1z"></path>
       <path d="M12 16.5v-3" />
       <path d="M12 8.5v.01" />
       <path d="M3 3h18" />
    </svg>
);

export const SendIcon = () => (
    <svg {...iconProps} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
        <line x1="22" y1="2" x2="11" y2="13"></line>
        <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
    </svg>
);

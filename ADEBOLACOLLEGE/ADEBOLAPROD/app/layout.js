import './globals.css';
import SiteChrome from '../components/site-chrome';

export const metadata = {
  title: 'Adebola College | Ilorin, Kwara State',
  description:
    'Learn about Adebola College, a private coeducational school in Ilorin, Kwara State, offering Junior and Senior Secondary education and distance learning.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var t=localStorage.getItem('adebola-theme');document.documentElement.dataset.theme=t==='light'||t==='dark'?t:(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light')}catch(e){document.documentElement.dataset.theme=matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'}`,
          }}
        />
      </head>
      <body>
        <SiteChrome>{children}</SiteChrome>
      </body>
    </html>
  );
}

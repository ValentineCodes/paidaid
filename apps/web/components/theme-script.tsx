/** Inline script so `body` theme class exists before paint (avoids flash). */
export function ThemeScript() {
  return (
    <script
      dangerouslySetInnerHTML={{
        __html: `(function(){try{var k='paidaid-theme';var s=localStorage.getItem(k);var d=window.matchMedia('(prefers-color-scheme: dark)').matches;var dark=s?s==='dark':d;document.body.classList.add('app');document.body.classList.toggle('dark',dark);}catch(e){document.body.classList.add('app');}})();`,
      }}
    />
  );
}

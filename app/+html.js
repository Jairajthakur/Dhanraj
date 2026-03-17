export default function Html({ children }) {
  return (
    <html>
      <head>
        <base href="/Dhanraj/" />
        <style>{`
          html, body { margin: 0; background: #ECEAE4; }
        `}</style>
      </head>
      <body>{children}</body>
    </html>
  );
}

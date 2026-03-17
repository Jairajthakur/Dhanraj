export default function Html({ children }) {
  return (
    <html>
      <head>
        <base href="/Dhanraj/" />
      </head>
      <body>{children}</body>
    </html>
  );
}

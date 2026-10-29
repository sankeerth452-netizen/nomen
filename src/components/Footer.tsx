import Link from "next/link";

export default function Footer() {
  return (
    <footer className="colophon">
      <div className="colophon-in">
        <span>Names are built only from the details you enter, checked against search data.</span>
        <Link href="/credits">Photography credits</Link>
      </div>
    </footer>
  );
}

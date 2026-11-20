import { notFound } from "next/navigation";
import { HttpError, requirePageUser } from "@/lib/auth/guards";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { loadReview, presentReview } from "@/lib/review/load";
import ReviewClient from "./ReviewClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "Review a product" };

export default async function ReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePageUser();
  let payload;
  try {
    const { g, review, settings } = await loadReview(user, (await params).id);
    payload = await presentReview(g, review, user, settings);
  } catch (e) {
    if (e instanceof HttpError && e.status === 404) notFound();
    if (e instanceof HttpError && e.status === 409) {
      return (<><Header user={user} active="review" /><main><p className="muted" style={{ marginTop: 40 }}>{e.message}</p></main><Footer /></>);
    }
    throw e;
  }
  return (
    <>
      <Header user={user} active="review" />
      <main><ReviewClient initial={JSON.parse(JSON.stringify(payload))} /></main>
      <Footer />
    </>
  );
}

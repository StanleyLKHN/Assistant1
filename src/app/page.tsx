import ChatBox from '@/src/components/ChatBox';

export default function Home() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-6 bg-[#faf7f2] text-neutral-900">
      <div className="w-full max-w-[700px] p-8">
        <h1 className="font-serif font-light text-5xl tracking-tight mb-2">
          Unweave
        </h1>
        <p className="text-sm text-neutral-500 mb-8">
          A zero-waste fashion label.
        </p>
        <ChatBox />
      </div>
    </main>
  );
}

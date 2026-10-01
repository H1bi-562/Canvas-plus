"use client";

import { useRouter } from "next/navigation";
import LoginPage from "./_components/LoginPage";

export default function Page() {
  const router = useRouter();
  return <div className="size-full flex flex-col bg-gray-50">
    <div className="shadow-sm px-6 py-4 flex items-center justify-between bg-white"><h1 className="text-2xl font-semibold text-gray-900">CanvasPlus</h1></div>
    <LoginPage onLoginSuccess={() => { router.replace("/assignments"); router.refresh(); }} />
  </div>;
}

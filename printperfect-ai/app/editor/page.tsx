import { Editor } from '@/components/editor/Editor';

export const metadata = {
  title: 'Editor',
  description: 'Upscale, colorize, restore, and print your photos — all in your browser.',
};

export default function EditorPage() {
  return (
    // 100vh minus the global layout header (h-14 = 56px). If the layout
    // header height changes, this calc must update to match.
    <div className="h-[calc(100vh-56px)] w-screen overflow-hidden">
      <Editor />
    </div>
  );
}

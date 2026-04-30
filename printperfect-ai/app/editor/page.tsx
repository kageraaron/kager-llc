import { Editor } from '@/components/editor/Editor';

export const metadata = {
  title: 'Editor',
  description: 'Upscale, colorize, restore, and print your photos — all in your browser.',
};

export default function EditorPage() {
  return (
    <div className="h-screen w-screen overflow-hidden">
      <Editor />
    </div>
  );
}

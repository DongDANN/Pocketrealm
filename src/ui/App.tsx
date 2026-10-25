import { useEffect, useState } from 'react';
import { Route, Routes } from 'react-router-dom';
import { C } from '../art/palette';
import { useOnline } from './hooks/useOnline';
import { subscribePwa, type PwaState } from '../pwa/register';
import { PixelText } from './components/PixelText';
import { Foundation } from './screens/Foundation';
import { ArtPreview } from './screens/ArtPreview';
import { TodayMock } from './screens/TodayMock';

export function App() {
  const online = useOnline();
  const [pwa, setPwa] = useState<PwaState>({ offlineReady: false, needRefresh: false });

  useEffect(() => subscribePwa(setPwa), []);

  return (
    <>
      <Routes>
        <Route path="/" element={<Foundation needRefresh={pwa.needRefresh} />} />
        <Route path="/art" element={<ArtPreview />} />
        <Route path="/today" element={<TodayMock />} />
        <Route path="*" element={<Foundation needRefresh={pwa.needRefresh} />} />
      </Routes>
      {!online && (
        <p className="offline-strip" role="status">
          <PixelText
            text="Working offline. Everything is saved on this device."
            color={C.paper1}
            pixelScale={2}
            wrap={30}
            align="center"
          />
        </p>
      )}
    </>
  );
}

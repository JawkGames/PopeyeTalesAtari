// Oyunu başlatır. Ekran açıldığı pencereye / ekrana tam oturur (sabit en-boy oranı yok);
// tuval cihaz piksel oranında çizilir (retina / telefon ekranlarında bulanıklık olmaz).
// v1.82: telefondaki uygulamada grafik bir kez "orta"ya alınır (DPR 2 → 1.5: ~%44 daha az piksel, kasma azalır); oyuncu sonra ayarlardan değiştirebilir
if (Reklam.native && !ayarAl().grGecis) { const A = ayarAl(); A.gr = Math.min(A.gr, 1); A.grGecis = 1; kayitYaz(); }
const DPR = Math.min(window.devicePixelRatio || 1, GR_DPR[ayarAl().gr]);   // v1.61: grafik ayarı çözünürlüğü sınırlar
const ekranW = () => Math.max(1, Math.round(window.innerWidth * DPR));
const ekranH = () => Math.max(1, Math.round(window.innerHeight * DPR));

// Bölümler sırayla; adres çubuğunda ?bolum=2 ile doğrudan o bölüm açılır
const BOLUMLER = [LEVEL1, LEVEL2, LEVEL3, LEVEL4];
// v1.78: adres yoksa (ve uygulamada her zaman) kalınan bölümden devam: KAYIT.sonBolum = ulaşılan en ileri bölüm
const adresBolum = GELISTIRME ? parseInt(new URLSearchParams(location.search).get('bolum')) : 0;
const ilkBolum = Math.min(BOLUMLER.length - 1, Math.max(0, adresBolum ? adresBolum - 1 : (KAYIT.sonBolum || 0)));

const oyun = new Phaser.Game({
  type: Phaser.AUTO,
  width: ekranW(),
  height: ekranH(),
  parent: 'oyun',
  backgroundColor: '#141c26',
  pixelArt: false,
  antialias: true,
  mipmapFilter: 'LINEAR_MIPMAP_LINEAR',
  physics: { default: 'arcade', arcade: { gravity: { y: CONFIG.fizik.yercekimi }, debug: false } },
  scale: { mode: Phaser.Scale.NONE, zoom: 1 / DPR },
  input: { activePointers: 4 },
  render: { powerPreference: 'high-performance' },   // v1.82
  scene: [OnSahnesi, BootSahnesi, GirisSahnesi, OyunSahnesi, ArayuzSahnesi, YuzmeSahnesi, AyarSahnesi]
});

// Pencere boyutu / telefon yönü / tam ekran değişince tuvali yeniden boyutla
let boyutZaman = null;
const yenidenBoyutla = () => {
  clearTimeout(boyutZaman);
  boyutZaman = setTimeout(() => {
    oyun.scale.resize(ekranW(), ekranH());
    oyun.scale.setZoom(1 / DPR);
  }, 60);
};
window.addEventListener('resize', yenidenBoyutla);
window.addEventListener('orientationchange', yenidenBoyutla);
document.addEventListener('fullscreenchange', yenidenBoyutla);
// v1.82: uygulamada ilk ölçü çubuklar gizlenmeden alınmış olabilir — kısa süre sonra yeniden ölç
if (window.visualViewport) window.visualViewport.addEventListener('resize', yenidenBoyutla);
if (Reklam.native) { setTimeout(yenidenBoyutla, 300); setTimeout(yenidenBoyutla, 1000); }

Reklam.baslat();   // v1.77: uygulamada AdMob (web'de boş)

// Android paketi hazırlığı (GitHub Actions: .github/workflows/derle.yml). Kullanım:
//   node scripts/hazirla.js www      -> www/ üretir: index.html + js + assets (assets/kaynak hariç) + lib (Phaser, Capacitor, AdMob);
//                                       index.html'deki CDN Phaser satırı yerel dosyalarla değişir
//   node scripts/hazirla.js config   -> capacitor.config.json
//   node scripts/hazirla.js android  -> Android projesine AdMob kimliği, yatay gerçek tam ekran (immersive MainActivity), sürüm numarası, yayın imzası
// Ayarlar js/ayarlar.js → CONFIG.mobil (paket adı, oyun adı, reklam kimlikleri).
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const kok = path.join(__dirname, '..');
const ctx = { window: {}, console };
vm.runInNewContext(fs.readFileSync(path.join(kok, 'js/ayarlar.js'), 'utf8') + ';this.CONFIG = CONFIG;', ctx);
const C = ctx.CONFIG, M = C.mobil;
const TEST_APP_ID = 'ca-app-pub-3940256099942544~3347511713';
const adim = process.argv[2];

if (adim === 'www') {
  const www = path.join(kok, 'www');
  fs.rmSync(www, { recursive: true, force: true });
  fs.mkdirSync(path.join(www, 'lib'), { recursive: true });
  fs.cpSync(path.join(kok, 'js'), path.join(www, 'js'), { recursive: true });
  fs.cpSync(path.join(kok, 'assets'), path.join(www, 'assets'), { recursive: true, filter: (s) => !s.startsWith(path.join(kok, 'assets', 'kaynak')) });
  const nm = path.join(kok, 'node_modules');
  fs.copyFileSync(path.join(nm, 'phaser/dist/phaser.min.js'), path.join(www, 'lib/phaser.min.js'));
  fs.copyFileSync(path.join(nm, '@capacitor/core/dist/capacitor.js'), path.join(www, 'lib/capacitor.js'));
  fs.copyFileSync(path.join(nm, '@capacitor-community/admob/dist/plugin.js'), path.join(www, 'lib/admob.js'));
  let h = fs.readFileSync(path.join(kok, 'index.html'), 'utf8');
  const cdn = /<script src="https:\/\/cdn\.jsdelivr\.net\/npm\/phaser@[^"]*"><\/script>/;
  if (!cdn.test(h)) throw new Error('index.html içinde CDN Phaser satırı bulunamadı');
  h = h.replace(cdn, '<script src="lib/capacitor.js"></script>\n<script src="lib/admob.js"></script>\n<script src="lib/phaser.min.js"></script>');
  fs.writeFileSync(path.join(www, 'index.html'), h);
  console.log('www/ hazır');
}

if (adim === 'config') {
  fs.writeFileSync(path.join(kok, 'capacitor.config.json'), JSON.stringify({
    appId: M.paketAdi, appName: M.oyunAdi, webDir: 'www', android: { backgroundColor: '#111111' },
    // Capacitor 8 SystemBars: açılışta çubukları gizli tut; ekran kenarına iç boşluk (padding) koymasın → oyun bütün ekranı kaplar
    plugins: { SystemBars: { hidden: true, insetsHandling: 'disable' } }
  }, null, 2));
  console.log('capacitor.config.json yazıldı:', M.paketAdi);
}

if (adim === 'android') {
  const app = path.join(kok, 'android/app');
  const admobId = M.reklam.testModu ? TEST_APP_ID : M.reklam.uygulamaId;

  const strings = path.join(app, 'src/main/res/values/strings.xml');
  let s = fs.readFileSync(strings, 'utf8');
  if (!s.includes('admob_app_id')) s = s.replace('</resources>', `    <string name="admob_app_id">${admobId}</string>\n</resources>`);
  fs.writeFileSync(strings, s);

  const man = path.join(app, 'src/main/AndroidManifest.xml');
  let m = fs.readFileSync(man, 'utf8');
  if (!m.includes('gms.ads.APPLICATION_ID')) {
    m = m.replace(/<application([^>]*)>/, `<application$1>\n        <meta-data android:name="com.google.android.gms.ads.APPLICATION_ID" android:value="@string/admob_app_id" />`);
  }
  if (!m.includes('permission.AD_ID')) m = m.replace('<application', '<uses-permission android:name="com.google.android.gms.permission.AD_ID" />\n    <application');
  if (!m.includes('screenOrientation')) m = m.replace('<activity', '<activity\n            android:screenOrientation="sensorLandscape"');   // yatay oyun
  // v1.82: donanım özellikleri zorunlu olmasın (Play Console "required hardware feature" uyarısı çıkmasın)
  if (!m.includes('android.hardware.screen.landscape')) m = m.replace('<application', '<uses-feature android:name="android.hardware.screen.landscape" android:required="false" />\n    <uses-feature android:name="android.hardware.touchscreen" android:required="false" />\n    <application');
  fs.writeFileSync(man, m);

  // Tam ekran (durum çubuğu yok, çentik alanı kullanılır)
  const stil = path.join(app, 'src/main/res/values/styles.xml');
  let st = fs.readFileSync(stil, 'utf8');
  if (!st.includes('windowFullscreen')) {
    st = st.replace(/(<style name="AppTheme\.NoActionBar"[^>]*>)/, '$1\n        <item name="android:windowFullscreen">true</item>\n        <item name="android:windowLayoutInDisplayCutoutMode">shortEdges</item>');
    st = st.replace(/(<style name="AppTheme\.NoActionBarLaunch"[^>]*>)/, '$1\n        <item name="windowSplashScreenBackground">#111111</item>');
  }
  // v1.82: Capacitor 8 decor arka planını temanın windowBackground'una boyar; açık temada beyaz → WebView'in çizmediği kenarlar beyaz görünür
  if (!st.includes('android:windowBackground')) st = st.replace(/(<style name="AppTheme\.NoActionBar"[^>]*>)/, '$1\n        <item name="android:windowBackground">@android:color/black</item>');
  fs.writeFileSync(stil, st);

  // Gerçek tam ekran (immersive): MainActivity, durum çubuğu + gezinme çubuğunu gizler; kenardan kaydırınca geçici görünürler.
  // Her açılışta / geri dönüşte / odak geri gelince yeniden gizler. Dosya her seferinde baştan yazılır (tekrar çalışınca bozulmaz).
  const javaKok = path.join(app, 'src/main/java');
  const javaBul = (d) => fs.existsSync(d) ? fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? javaBul(path.join(d, e.name)) : (e.name === 'MainActivity.java' ? [path.join(d, e.name)] : [])) : [];
  const beklenen = path.join(javaKok, ...M.paketAdi.split('.'), 'MainActivity.java');
  const bulunan = javaBul(javaKok);
  const anaAkt = bulunan.includes(beklenen) ? beklenen : bulunan[0];
  if (!anaAkt) throw new Error('MainActivity.java bulunamadı: ' + javaKok + ' (önce "npx cap add android" çalışmalı)');
  const paket = (fs.readFileSync(anaAkt, 'utf8').match(/^\s*package\s+([\w.]+)\s*;/m) || [])[1] || M.paketAdi;
  fs.writeFileSync(anaAkt, `package ${paket};

import android.graphics.Color;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.view.Window;
import android.view.WindowManager;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import com.getcapacitor.BridgeActivity;

// scripts/hazirla.js tarafından yazılır (elle değiştirme): gerçek tam ekran / immersive
public class MainActivity extends BridgeActivity {

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        // v1.82: WebView kenara kadar çizsin — çubuk / çentik boşluklarını sıfırla (CONSUMED değil: WebView'in güvenli alan hesabı bozulmasın)
        View wv = getBridge().getWebView();
        wv.setBackgroundColor(Color.BLACK);
        View ana = (View) wv.getParent();
        ViewCompat.setOnApplyWindowInsetsListener(ana, (v, insets) -> {
            v.setPadding(0, 0, 0, 0);
            return new WindowInsetsCompat.Builder(insets)
                .setInsets(WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout(), Insets.NONE)
                .build();
        });
        ana.setPadding(0, 0, 0, 0);
        tamEkran();
        // eklentiler yüklenirken çubuklar yeniden açılırsa diye bir kez daha
        getWindow().getDecorView().postDelayed(this::tamEkran, 300);
    }

    @Override
    public void onResume() {
        super.onResume();
        tamEkran();
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) tamEkran();
    }

    private void tamEkran() {
        Window w = getWindow();
        WindowCompat.setDecorFitsSystemWindows(w, false);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            WindowManager.LayoutParams lp = w.getAttributes();
            lp.layoutInDisplayCutoutMode = Build.VERSION.SDK_INT >= Build.VERSION_CODES.R
                ? WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_ALWAYS
                : WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;
            w.setAttributes(lp);
        }
        View decor = w.getDecorView();
        decor.setBackgroundColor(Color.BLACK);
        WindowInsetsControllerCompat c = WindowCompat.getInsetsController(w, decor);
        c.setSystemBarsBehavior(WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
        c.hide(WindowInsetsCompat.Type.systemBars());
    }
}
`);
  if (anaAkt !== beklenen) console.warn('Uyarı: MainActivity beklenen yerde değil, bulunan kullanıldı:', anaAkt);

  // Sürüm: Play'deki eski (Unity) sürümlerin üstünde kalsın diye taban + derleme numarası
  const gradle = path.join(app, 'build.gradle');
  const no = M.surumTaban + (+process.env.GITHUB_RUN_NUMBER || 1);
  let g = fs.readFileSync(gradle, 'utf8');
  g = g.replace(/versionCode \d+/, `versionCode ${no}`).replace(/versionName "[^"]*"/, `versionName "${C.surum.replace(/^v/, '')}"`);
  if (process.env.KEYSTORE_PATH && !g.includes('signingConfigs')) {
    g = g.replace('    buildTypes {', `    signingConfigs {
        release {
            storeFile file(System.getenv("KEYSTORE_PATH"))
            storePassword System.getenv("KEYSTORE_PASSWORD")
            keyAlias System.getenv("KEY_ALIAS")
            keyPassword System.getenv("KEY_PASSWORD")
        }
    }
    buildTypes {`).replace('minifyEnabled false', 'minifyEnabled false\n            signingConfig signingConfigs.release');
  }
  fs.writeFileSync(gradle, g);

  // Simge / açılış görseli: android-res/ varsa res klasörüne kopyalanır (yoksa Capacitor'ın varsayılanı kalır)
  const kaynak = path.join(kok, 'android-res'), res = path.join(app, 'src/main/res');
  if (fs.existsSync(kaynak)) {
    fs.cpSync(kaynak, res, { recursive: true });
    const splash = path.join(kaynak, 'drawable/splash.png');   // şablondaki bütün yoğunluk klasörlerine (yoksa bazılarında varsayılan kalır)
    if (fs.existsSync(splash)) for (const d of fs.readdirSync(res)) {
      if (d.startsWith('drawable') && fs.existsSync(path.join(res, d, 'splash.png'))) fs.copyFileSync(splash, path.join(res, d, 'splash.png'));
    }
  }

  console.log('Android ayarlandı. AdMob:', admobId, 'versionCode:', no, 'versionName:', C.surum);
}

package com.jag.voracity;

import android.os.Bundle;
import android.view.View;
import android.view.WindowManager;
import android.webkit.WebView;

import com.getcapacitor.BridgeActivity;

/** VORA CITY — full-screen landscape game shell (immersive sticky, screen kept on). */
public class MainActivity extends BridgeActivity {
  @Override
  public void onCreate(Bundle savedInstanceState) {
    super.onCreate(savedInstanceState);
    getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
    if (android.os.Build.VERSION.SDK_INT >= 28) {
      getWindow().getAttributes().layoutInDisplayCutoutMode = WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;
    }
    WebView web = getBridge().getWebView();
    web.setBackgroundColor(0xFF000000);
    // the game renders at its own pixel ratio; no WebView-side zoom/scroll
    web.setOverScrollMode(View.OVER_SCROLL_NEVER);
    web.setHorizontalScrollBarEnabled(false);
    web.setVerticalScrollBarEnabled(false);
    hideSystemUI();
  }

  @Override
  public void onWindowFocusChanged(boolean hasFocus) {
    super.onWindowFocusChanged(hasFocus);
    if (hasFocus) hideSystemUI();
  }

  @Override
  public void onResume() {
    super.onResume();
    hideSystemUI();
  }

  private void hideSystemUI() {
    View decor = getWindow().getDecorView();
    decor.setSystemUiVisibility(
      View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
        | View.SYSTEM_UI_FLAG_LAYOUT_STABLE
        | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
        | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
        | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
        | View.SYSTEM_UI_FLAG_FULLSCREEN);
  }
}

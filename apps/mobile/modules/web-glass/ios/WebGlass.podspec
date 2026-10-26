Pod::Spec.new do |s|
  s.name           = 'WebGlass'
  s.version        = '1.0.0'
  s.summary        = 'Native UIKit controls placed inside the WKWebView scroll view'
  s.description    = 'Places native UIKit controls (segmented control, switch, glass button) inside the WKWebView scroll view at document coordinates'
  s.author         = ''
  s.homepage       = 'https://docs.expo.dev/modules/'
  s.platforms      = { :ios => '16.4' }
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES'
  }

  s.source_files = "**/*.{h,m,swift}"
  # 웹 아이콘을 렌더한 버튼 이미지. Swift가 이 번들 이름으로 찾는다.
  s.resource_bundles = { 'WebGlass' => ['Assets/*.png'] }
end

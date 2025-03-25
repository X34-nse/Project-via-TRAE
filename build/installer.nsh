!macro customInstall
  SetRegView 64
  WriteRegStr HKLM "SOFTWARE\Microsoft\Windows\CurrentVersion\Run" "${APP_NAME}" "$INSTDIR\${APP_EXECUTABLE_FILENAME}"
!macroend

!macro customUnInstall
  SetRegView 64
  DeleteRegValue HKLM "SOFTWARE\Microsoft\Windows\CurrentVersion\Run" "${APP_NAME}"
!macroend
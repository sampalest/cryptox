!macro customHeader
  # Lockasaur publishes one installer per architecture. Force the stock NSIS
  # payload selector to use the only embedded payload. This covers Windows
  # ARM64 systems where the x86 NSIS process can fail to report the native
  # architecture and otherwise installs only uninstall.exe.
  !ifdef APP_ARM64
    !ifndef APP_64
      !ifndef APP_32
        !undef IsNativeARM64
        !define IsNativeARM64 `1 = 1`
      !endif
    !endif
  !endif
  !ifdef APP_64
    !ifndef APP_ARM64
      !ifndef APP_32
        !undef RunningX64
        !define RunningX64 `1 = 1`
      !endif
    !endif
  !endif
!macroend

!macro customInit
  ReadEnvStr $R0 "PROCESSOR_ARCHITEW6432"
  ReadEnvStr $R1 "PROCESSOR_ARCHITECTURE"
  !ifdef APP_ARM64
    !ifndef APP_64
      !ifndef APP_32
        ${If} $R0 != "ARM64"
        ${AndIf} $R1 != "ARM64"
          MessageBox MB_OK|MB_ICONSTOP "This Lockasaur installer requires Windows on ARM64."
          SetErrorLevel 2
          Quit
        ${EndIf}
      !endif
    !endif
  !endif
  !ifdef APP_64
    !ifndef APP_ARM64
      !ifndef APP_32
        ${If} $R0 != "AMD64"
        ${AndIf} $R1 != "AMD64"
        ${AndIf} $R0 != "ARM64"
        ${AndIf} $R1 != "ARM64"
          MessageBox MB_OK|MB_ICONSTOP "This Lockasaur installer requires 64-bit Windows on an x64 or ARM64 processor."
          SetErrorLevel 2
          Quit
        ${EndIf}
      !endif
    !endif
  !endif
!macroend

!macro verifyApplicationPayload
  ${IfNot} ${FileExists} "$INSTDIR\${APP_EXECUTABLE_FILENAME}"
    MessageBox MB_OK|MB_ICONSTOP "Lockasaur could not be installed because the application payload was not extracted."
    RMDir /r "$INSTDIR"
    SetErrorLevel 2
    Abort
  ${EndIf}
!macroend

!macro customFiles_arm64
  !insertmacro verifyApplicationPayload
!macroend

!macro customFiles_x64
  !insertmacro verifyApplicationPayload
!macroend

!macro customFiles_ia32
  !insertmacro verifyApplicationPayload
!macroend

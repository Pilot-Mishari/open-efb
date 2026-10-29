; Open EFB custom NSIS hooks (electron-builder "include").
; This file is compiled into both the installer and the uninstaller pass, so
; every macro body is only inserted by the template's own !ifmacrodef guards.

!include nsDialogs.nsh

; Declared only for the installer pass: the uninstaller build compiles neither
; the shortcut page nor customInstall, and NSIS treats the unused-var warning
; as an error.
!ifndef BUILD_UNINSTALLER
  Var EfbDesktopShortcut   ; "" = page never shown (silent run), "1" = create, "0" = don't
  Var EfbShortcutCheck     ; HWND of the page checkbox, valid during the leave callback
!endif

; ---------------------------------------------------------------------------
; Prerequisite check: 64-bit Windows is already enforced by electron-builder
; (x64WinRequired). Electron also needs Windows 10 or later, so refuse to run
; on anything older instead of failing halfway through the install.
; ---------------------------------------------------------------------------
!macro customInit
  ReadRegDWORD $9 HKLM "SOFTWARE\Microsoft\Windows NT\CurrentVersion" CurrentBuild
  ${IfThen} $9 == "" ${|} StrCpy $9 "0" ${|}
  ${If} $9 < 10240
    MessageBox MB_OK|MB_ICONSTOP "Open EFB requires Windows 10 (build 10240) or newer.$\r$\n$\r$\nThis computer reports Windows build $9. Setup will now close."
    Quit
  ${EndIf}
!macroend

; ---------------------------------------------------------------------------
; Optional desktop shortcut. The Start Menu entry is always created by
; electron-builder; this page (shown after the folder choice) only decides
; about the desktop icon. The choice is applied in customInstall, where
; $newDesktopLink is known. Silent installs skip the page, keep electron-
; builder's default behaviour, and can still opt out with /NODESKTOPSHORTCUT.
; ---------------------------------------------------------------------------
!macro customPageAfterChangeDir
  Page custom EfbShortcutPageCreate EfbShortcutPageLeave

  Function EfbShortcutPageCreate
    nsDialogs::Create 1018
    Pop $9
    ${If} $9 == error
      Abort
    ${EndIf}
    ${NSD_CreateLabel} 0u 0u 100% 40u "Would you like an Open EFB shortcut on your desktop?$\r$\n$\r$\nA Start Menu shortcut is always created either way. You can change this later by running Setup again."
    Pop $9
    ${NSD_CreateCheckbox} 0u 52u 100% 12u "&Create a desktop shortcut"
    Pop $EfbShortcutCheck
    ${NSD_Check} $EfbShortcutCheck
    nsDialogs::Show
  FunctionEnd

  Function EfbShortcutPageLeave
    ${NSD_GetState} $EfbShortcutCheck $9
    ${If} $9 == "0"
      StrCpy $EfbDesktopShortcut "0"
    ${Else}
      StrCpy $EfbDesktopShortcut "1"
    ${EndIf}
  FunctionEnd
!macroend

; Runs inside the install section, after the shortcut macros: honours the page
; choice (create the desktop link the user asked for, delete the one they
; declined) without touching the Start Menu entry.
!macro customInstall
  ${IfNot} ${isNoDesktopShortcut}
    ${If} $EfbDesktopShortcut == "0"
      Delete "$newDesktopLink"
    ${ElseIf} $EfbDesktopShortcut == "1"
      ${IfNot} ${FileExists} "$newDesktopLink"
        CreateShortCut "$newDesktopLink" "$appExe" "" "$appExe" 0 "" "" "${APP_DESCRIPTION}"
        ClearErrors
        WinShell::SetLnkAUMI "$newDesktopLink" "${APP_ID}"
      ${EndIf}
    ${EndIf}
    System::Call 'Shell32::SHChangeNotify(i 0x8000000, i 0, i 0, i 0)'
  ${EndIf}
!macroend

; Upgrades run the old uninstaller silently, so user data is only offered for deletion on a real uninstall.
!macro customUnInstall
  ${ifNot} ${isUpdated}
    MessageBox MB_YESNO|MB_ICONQUESTION|MB_DEFBUTTON2 "Open EFB keeps your settings, paired tablets and logs in:$\r$\n$APPDATA\${APP_FILENAME}$\r$\n$\r$\nDelete them as well?$\r$\n$\r$\nChoose No to keep them (recommended if you may reinstall)." /SD IDNO IDNO openEfbKeepData
      RMDir /r "$APPDATA\${APP_FILENAME}"
    openEfbKeepData:
  ${endIf}
!macroend

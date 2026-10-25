; Upgrades run the old uninstaller silently, so user data is only offered for deletion on a real uninstall.
!macro customUnInstall
  ${ifNot} ${isUpdated}
    MessageBox MB_YESNO|MB_ICONQUESTION|MB_DEFBUTTON2 "Open EFB keeps your settings, paired tablets and logs in:$\r$\n$APPDATA\${APP_FILENAME}$\r$\n$\r$\nDelete them as well?$\r$\n$\r$\nChoose No to keep them (recommended if you may reinstall)." /SD IDNO IDNO openEfbKeepData
      RMDir /r "$APPDATA\${APP_FILENAME}"
    openEfbKeepData:
  ${endIf}
!macroend

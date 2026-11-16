-- AI Video Studio.app (stay-open applet, compiled by scripts/make_app.sh).
-- run: start the local server + open the browser · open: drop a video → new project · reopen (Dock click): menu · quit: stop the server.

on L(args)
	set sh to quoted form of (POSIX path of (path to me) & "Contents/MacOS/avs-launch.sh")
	try
		return do shell script sh & " " & args
	on error msg number n
		if n is not -128 then display dialog msg with title "AI Video Studio" buttons {"OK"} default button "OK" with icon caution
		return "ERR"
	end try
end L

on run
	L("start")
end run

on open theItems
	repeat with f in theItems
		L("new " & quoted form of POSIX path of f)
	end repeat
end open

on reopen
	set r to display dialog "AI Video Studio đang chạy." & return & "Thả video vào biểu tượng app để tạo dự án mới." with title "AI Video Studio" buttons {"Thoát Studio", "Mở thư mục dự án", "Mở Studio"} default button "Mở Studio" giving up after 30
	set b to button returned of r
	if b is "Mở Studio" then
		L("start")
	else if b is "Mở thư mục dự án" then
		L("reveal")
	else if b is "Thoát Studio" then
		quit
	end if
end reopen

on quit
	L("stop")
	continue quit
end quit

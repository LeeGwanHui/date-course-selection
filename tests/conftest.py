# -*- coding: utf-8 -*-
"""save_course.py는 리포 루트에 있는 단일 파일 스크립트라 패키지가 아니다.
   pytest가 그대로 import할 수 있도록 루트를 sys.path에 넣는다."""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

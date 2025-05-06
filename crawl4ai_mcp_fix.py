#!/usr/bin/env python3
"""
修复crawl4ai_mcp_server.py中CacheMode.DEFAULT不存在的问题
此脚本应当与crawl4ai_mcp_server.py文件放在同一目录中

用法:
1. 将此脚本保存为crawl4ai_mcp_fix.py
2. 确保已经安装了crawl4ai-mcp-server包
3. 运行: python3 crawl4ai_mcp_fix.py
"""

import os
import re
import sys
from enum import Enum, auto

# 定义CacheMode枚举


class CacheMode(Enum):
    DEFAULT = auto()
    BYPASS = auto()
    FORCE = auto()


def fix_crawl4ai_mcp_server():
    """修复crawl4ai_mcp_server.py文件"""
    # 获取当前目录中的crawl4ai_mcp_server.py文件
    filename = "crawl4ai_mcp_server.py"

    if not os.path.exists(filename):
        print(f"错误: 在当前目录中未找到{filename}文件")
        return False

    # 读取文件内容
    with open(filename, 'r', encoding='utf-8') as f:
        content = f.read()

    # 检查文件中是否已经定义了CacheMode
    if "class CacheMode" in content:
        print(f"文件{filename}中已经定义了CacheMode类，无需修复")
        return True

    # 在导入语句块后添加CacheMode枚举定义
    imports_pattern = r"from pydantic import BaseModel, Field"
    cachemode_definition = """
# 添加CacheMode枚举类定义，解决"type object 'CacheMode' has no attribute 'DEFAULT'"错误
class CacheMode(Enum):
    DEFAULT = auto()
    BYPASS = auto()
    FORCE = auto()
"""

    # 添加enum导入
    if "from enum import Enum" not in content:
        content = content.replace("from typing import Dict, Any, List, Optional, Union, Tuple",
                                  "from typing import Dict, Any, List, Optional, Union, Tuple\nfrom enum import Enum, auto")

    # 添加CacheMode定义
    if imports_pattern in content:
        content = content.replace(
            imports_pattern, imports_pattern + cachemode_definition)
    else:
        print("错误: 未找到导入语句块，无法添加CacheMode定义")
        return False

    # 修改crawl_webpage_impl调用
    # 修改模式1: validated_params.bypass_cache
    pattern1 = r"(await crawl_webpage_impl\(\s*validated_params\.url,\s*validated_params\.include_images),\s*validated_params\.bypass_cache"
    replacement1 = r"\1, CacheMode.BYPASS if validated_params.bypass_cache else CacheMode.DEFAULT"
    content = re.sub(pattern1, replacement1, content)

    # 修改模式2: params.bypass_cache
    pattern2 = r"(await crawl_webpage_impl\(\s*params\.url,\s*params\.include_images),\s*params\.bypass_cache"
    replacement2 = r"\1, CacheMode.BYPASS if params.bypass_cache else CacheMode.DEFAULT"
    content = re.sub(pattern2, replacement2, content)

    # 修改模式3: False参数
    pattern3 = r"(await crawl_webpage_impl\(\s*url,\s*True),\s*False"
    replacement3 = r"\1, CacheMode.DEFAULT"
    content = re.sub(pattern3, replacement3, content)

    # 写回文件
    with open(filename, 'w', encoding='utf-8') as f:
        f.write(content)

    print(f"文件{filename}已成功修复")
    return True


if __name__ == "__main__":
    print("开始修复crawl4ai_mcp_server.py文件...")
    if fix_crawl4ai_mcp_server():
        print("修复完成。请重新尝试注册并调用MCP工具")
    else:
        print("修复失败。请手动修改文件")
        sys.exit(1)
